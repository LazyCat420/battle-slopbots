"""
3D Bot Pipeline — FastAPI Backend Server

Unified API for the 3D bot generation pipeline:
- POST /generate       — Image → 3D mesh via TripoSG or Hunyuan3D
- POST /generate-text  — Text → 3D mesh via Hunyuan3D
- POST /search-image   — Search + background removal
- POST /merge          — Merge multiple GLBs via trimesh
- POST /assemble       — LLM-driven slot-based assembly
- POST /rig            — Auto-rig via UniRig pipeline
- GET  /status         — GPU/VRAM status
- GET  /health         — Health check

Usage:
    cd tools/3d-gen
    .\\venv\\Scripts\\activate
    uvicorn server:app --host 0.0.0.0 --port 8100 --reload
"""

import logging
import os
import subprocess
import sys
import time
import uuid
from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path

import numpy as np
import trimesh
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image
from pydantic import BaseModel

# ── Windows CUDA DLL fix (must be before CUDA extension imports) ──
_cuda_path = os.environ.get("CUDA_PATH", r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.0")
_cuda_bin = os.path.join(_cuda_path, "bin")
if os.path.isdir(_cuda_bin) and hasattr(os, "add_dll_directory"):
    os.add_dll_directory(_cuda_bin)


# ── Logging ──────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("pipeline")

# ── Config ───────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent  # battle-bots/
TOOLS_DIR = PROJECT_ROOT / "tools"
UNIRIG_DIR = TOOLS_DIR / "UniRig"
OUTPUT_DIR = PROJECT_ROOT / "public" / "parts" / "generated"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── TripoSG paths ────────────────────────────────────────

TRIPOSG_DIR = Path(__file__).resolve().parent / "TripoSG-model"
TRIPOSG_WEIGHTS = TRIPOSG_DIR / "pretrained_weights" / "TripoSG"
RMBG_WEIGHTS = TRIPOSG_DIR / "pretrained_weights" / "RMBG-1.4"

# Add TripoSG source paths
sys.path.insert(0, str(TRIPOSG_DIR))
sys.path.insert(0, str(TRIPOSG_DIR / "scripts"))

# ── Hunyuan3D paths ──────────────────────────────────────

HUNYUAN3D_DIR = Path(__file__).resolve().parent / "Hunyuan3D-model"
sys.path.insert(0, str(HUNYUAN3D_DIR))

# Default model: full model for 24GB+ VRAM (3090 Ti, 4090, A6000, etc.)
# Use "tencent/Hunyuan3D-2mini" for GPUs with < 12GB VRAM
HUNYUAN3D_MODEL_ID = os.environ.get("HUNYUAN3D_MODEL", "tencent/Hunyuan3D-2")

# ── TripoSG lazy loading ────────────────────────────────

triposg_pipe = None
rmbg_net = None


def get_triposg_models():
    """Lazy-load TripoSG pipeline + RMBG on first use."""
    global triposg_pipe, rmbg_net
    if triposg_pipe is not None:
        return triposg_pipe, rmbg_net

    try:
        import torch
        from huggingface_hub import snapshot_download
        from triposg.pipelines.pipeline_triposg import TripoSGPipeline
        from briarmbg import BriaRMBG

        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32

        # Download model weights if not cached
        log.info("Loading TripoSG model (first time downloads ~3GB)...")
        snapshot_download(repo_id="VAST-AI/TripoSG", local_dir=str(TRIPOSG_WEIGHTS))
        snapshot_download(repo_id="briaai/RMBG-1.4", local_dir=str(RMBG_WEIGHTS))

        # Load RMBG for background removal
        rmbg_net = BriaRMBG.from_pretrained(str(RMBG_WEIGHTS)).to(device)
        rmbg_net.eval()
        log.info("RMBG-1.4 loaded for background removal")

        # Load TripoSG pipeline
        triposg_pipe = TripoSGPipeline.from_pretrained(
            str(TRIPOSG_WEIGHTS)
        ).to(device, dtype)
        log.info(f"TripoSG loaded on {device}")

        return triposg_pipe, rmbg_net
    except ImportError as e:
        log.warning(f"TripoSG not installed — /generate unavailable: {e}")
        return None, None
    except Exception as e:
        log.error(f"TripoSG load failed: {e}")
        return None, None


def unload_triposg():
    """Free TripoSG from VRAM when needed by other models."""
    global triposg_pipe, rmbg_net
    if triposg_pipe is not None or rmbg_net is not None:
        import gc
        import torch

        del triposg_pipe, rmbg_net
        triposg_pipe = None
        rmbg_net = None
        gc.collect()
        torch.cuda.empty_cache()
        log.info("TripoSG unloaded, VRAM freed")


# ── Hunyuan3D lazy loading ───────────────────────────────

hunyuan3d_pipe = None
hunyuan3d_text2img = None


def get_hunyuan3d_model():
    """Lazy-load Hunyuan3D shape generation pipeline on first use."""
    global hunyuan3d_pipe
    if hunyuan3d_pipe is not None:
        return hunyuan3d_pipe

    try:
        from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline

        log.info(f"Loading Hunyuan3D shape model: {HUNYUAN3D_MODEL_ID}...")
        hunyuan3d_pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
            HUNYUAN3D_MODEL_ID,
        )
        log.info(f"Hunyuan3D shape model loaded: {HUNYUAN3D_MODEL_ID}")
        return hunyuan3d_pipe
    except ImportError as e:
        log.warning(f"Hunyuan3D not installed — shape gen unavailable: {e}")
        return None
    except Exception as e:
        log.error(f"Hunyuan3D load failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def get_hunyuan3d_text2img():
    """Lazy-load Hunyuan3D text-to-image pipeline for text-to-3D."""
    global hunyuan3d_text2img
    if hunyuan3d_text2img is not None:
        return hunyuan3d_text2img

    try:
        from hy3dgen.text2image import HunyuanDiTPipeline

        log.info("Loading HunyuanDiT text-to-image model...")
        hunyuan3d_text2img = HunyuanDiTPipeline()
        log.info("HunyuanDiT text-to-image model loaded")
        return hunyuan3d_text2img
    except ImportError as e:
        log.warning(f"HunyuanDiT not available — text prompt requires image fallback: {e}")
        return None
    except Exception as e:
        log.error(f"HunyuanDiT text2img load failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def unload_hunyuan3d():
    """Free Hunyuan3D from VRAM when needed by other models."""
    global hunyuan3d_pipe, hunyuan3d_text2img
    import gc
    import torch

    freed = False
    if hunyuan3d_pipe is not None:
        del hunyuan3d_pipe
        hunyuan3d_pipe = None
        freed = True
        log.info("Hunyuan3D shape model unloaded")
    if hunyuan3d_text2img is not None:
        del hunyuan3d_text2img
        hunyuan3d_text2img = None
        freed = True
        log.info("HunyuanDiT text2img unloaded")
    if freed:
        gc.collect()
        torch.cuda.empty_cache()
        log.info("VRAM freed")


# ── Hunyuan3D-Paint lazy loading ─────────────────────────

hunyuan3d_paint = None


def get_hunyuan3d_paint():
    """Lazy-load Hunyuan3D texture painting pipeline on first use."""
    global hunyuan3d_paint
    if hunyuan3d_paint is not None:
        return hunyuan3d_paint

    try:
        from hy3dgen.texgen import Hunyuan3DPaintPipeline

        log.info(f"Loading Hunyuan3D-Paint texture pipeline: {HUNYUAN3D_MODEL_ID}...")
        hunyuan3d_paint = Hunyuan3DPaintPipeline.from_pretrained(
            HUNYUAN3D_MODEL_ID,
        )
        log.info("Hunyuan3D-Paint loaded")
        return hunyuan3d_paint
    except ImportError as e:
        log.warning(f"Hunyuan3D-Paint not installed — texture gen unavailable: {e}")
        return None
    except Exception as e:
        log.error(f"Hunyuan3D-Paint load failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def unload_hunyuan3d_paint():
    """Free Hunyuan3D-Paint from VRAM."""
    global hunyuan3d_paint
    import gc
    import torch

    if hunyuan3d_paint is not None:
        del hunyuan3d_paint
        hunyuan3d_paint = None
        gc.collect()
        torch.cuda.empty_cache()
        log.info("Hunyuan3D-Paint unloaded, VRAM freed")


# ── App ──────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("3D Pipeline Server starting...")
    log.info(f"Output directory: {OUTPUT_DIR}")
    yield
    unload_triposg()
    unload_hunyuan3d()
    log.info("3D Pipeline Server stopped")


app = FastAPI(
    title="3D Bot Pipeline",
    description="Local 3D bot generation pipeline: TripoSG + Hunyuan3D + trimesh + UniRig",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ───────────────────────────────────────────────


class GenerateRequest(BaseModel):
    """Request for /generate — image is uploaded as multipart."""

    resolution: int = 256
    bake_texture: bool = False


class GenerateTextRequest(BaseModel):
    """Request for /generate-text — text → 3D mesh via Hunyuan3D."""

    prompt: str
    seed: int = 42
    faces: int = -1  # Optional face reduction


class MergeRequest(BaseModel):
    """Request for /merge — merge multiple GLB files."""

    parts: list[dict]  # [{path: str, position: [x,y,z], rotation: [x,y,z]}]
    output_name: str = "merged_bot"


class RigRequest(BaseModel):
    """Request for /rig — auto-rig a GLB mesh."""

    glb_path: str
    output_name: str = "rigged_bot"


class PaintRequest(BaseModel):
    """Request for /paint — texture a GLB mesh."""

    glb_path: str  # web path like /parts/generated/assembled_bot.glb
    image_path: str = ""  # optional reference image for texture guidance
    search_query: str = ""  # search for reference image if no image_path
    output_name: str = "painted_bot"


class SearchImageRequest(BaseModel):
    """Request for /search-image — search + background removal."""

    query: str
    remove_bg: bool = True


class AttachmentPart(BaseModel):
    """A single attachment in the assembly."""

    description: str  # What this part is, e.g. "chainsaw"
    search_query: str = ""  # Image search query (or empty if image provided)
    text_prompt: str = ""  # Text prompt for Hunyuan3D text-to-3D
    image_path: str = ""  # Path to pre-existing image (alternative to search)
    glb_path: str = ""  # Path to pre-existing GLB (skip generation)
    slot: str  # Attachment slot name, e.g. "left_hand"
    scale: float = 1.0  # Scale relative to base mesh
    engine: str = "triposg"  # "triposg" or "hunyuan3d"


class AssembleRequest(BaseModel):
    """Request for /assemble — full LLM-driven assembly pipeline."""

    base_description: str = "humanoid in T-pose"
    base_search_query: str = ""  # Search query for base mesh image
    base_text_prompt: str = ""  # Text prompt for Hunyuan3D text-to-3D
    base_image_path: str = ""  # Or provide image directly
    base_glb_path: str = ""  # Or provide pre-generated GLB
    base_engine: str = "triposg"  # "triposg" or "hunyuan3d"
    attachments: list[AttachmentPart] = []
    output_name: str = "assembled_bot"
    auto_rig: bool = False  # Whether to auto-rig after merge
    auto_paint: bool = True  # Whether to auto-paint textures after merge
    paint_search_query: str = ""  # Custom search query for paint reference
    num_inference_steps: int = 50
    guidance_scale: float = 7.0


# ── Health & Status ──────────────────────────────────────


@app.get("/health")
async def health():
    """Health check."""
    return {"status": "ok", "timestamp": time.time()}


@app.get("/status")
async def status():
    """GPU and VRAM status."""
    gpu_info: dict = {"available": False}
    try:
        import torch

        if torch.cuda.is_available():
            gpu_info = {
                "available": True,
                "name": torch.cuda.get_device_name(0),
                "total_vram_gb": round(
                    torch.cuda.get_device_properties(0).total_mem / 1e9, 2
                ),
                "allocated_gb": round(torch.cuda.memory_allocated(0) / 1e9, 2),
                "reserved_gb": round(torch.cuda.memory_reserved(0) / 1e9, 2),
                "free_gb": round(
                    (
                        torch.cuda.get_device_properties(0).total_mem
                        - torch.cuda.memory_reserved(0)
                    )
                    / 1e9,
                    2,
                ),
            }
    except Exception as e:
        log.warning(f"GPU status check failed: {e}")
        gpu_info = {"available": False, "error": str(e)}

    try:
        generated = len(list(OUTPUT_DIR.glob("*.glb")))
    except Exception:
        generated = 0

    return {
        "gpu": gpu_info,
        "triposg_loaded": triposg_pipe is not None,
        "hunyuan3d_loaded": hunyuan3d_pipe is not None,
        "hunyuan3d_model": HUNYUAN3D_MODEL_ID,
        "engines_available": ["triposg"]
            + (["hunyuan3d"] if True else []),
        "output_dir": str(OUTPUT_DIR),
        "generated_parts": generated,
    }


# ── POST /generate — Image → 3D Mesh ────────────────────


@app.post("/generate")
async def generate_3d(
    file: UploadFile = File(...),
    num_inference_steps: int = 50,
    guidance_scale: float = 7.0,
    seed: int = 42,
    faces: int = -1,
):
    """Generate a 3D .glb mesh from an uploaded image using TripoSG."""
    pipe, rmbg = get_triposg_models()
    if pipe is None:
        raise HTTPException(
            503,
            "TripoSG model not available. Install dependencies first.",
        )

    try:
        import torch
        from image_process import prepare_image
        import tempfile

        # Read image and save to temp file (prepare_image needs file path)
        image_data = await file.read()
        image = Image.open(BytesIO(image_data))
        log.info(
            f"Generating 3D from image: {file.filename} ({image.size[0]}x{image.size[1]})"
        )

        # Save to temp file for prepare_image
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            image.save(tmp, format="PNG")
            tmp_path = tmp.name

        try:
            # TripoSG preprocessing: bg removal + crop + pad
            img_pil = prepare_image(
                tmp_path,
                bg_color=np.array([1.0, 1.0, 1.0]),
                rmbg_net=rmbg,
            )
            log.info("Image preprocessed (bg removed, cropped, padded)")
        finally:
            os.unlink(tmp_path)

        # Run TripoSG inference
        start = time.time()
        with torch.no_grad():
            outputs = pipe(
                image=img_pil,
                generator=torch.Generator(device=pipe.device).manual_seed(seed),
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
            ).samples[0]

        mesh = trimesh.Trimesh(
            outputs[0].astype(np.float32),
            np.ascontiguousarray(outputs[1]),
        )

        # Optional face reduction
        if faces > 0 and mesh.faces.shape[0] > faces:
            try:
                import pymeshlab
                ms = pymeshlab.MeshSet()
                ms.add_mesh(pymeshlab.Mesh(
                    vertex_matrix=mesh.vertices,
                    face_matrix=mesh.faces,
                ))
                ms.meshing_merge_close_vertices()
                ms.meshing_decimation_quadric_edge_collapse(targetfacenum=faces)
                cm = ms.current_mesh()
                mesh = trimesh.Trimesh(
                    vertices=cm.vertex_matrix(),
                    faces=cm.face_matrix(),
                )
                log.info(f"Mesh simplified to {faces} faces")
            except Exception as e:
                log.warning(f"Face reduction failed, using full mesh: {e}")

        elapsed = time.time() - start
        log.info(f"TripoSG inference: {elapsed:.1f}s")

        # Save GLB
        part_id = f"gen_{uuid.uuid4().hex[:8]}"
        output_path = OUTPUT_DIR / f"{part_id}.glb"
        mesh.export(str(output_path))
        log.info(f"Saved GLB: {output_path} ({os.path.getsize(output_path)} bytes)")

        return {
            "part_id": part_id,
            "glb_path": f"/parts/generated/{part_id}.glb",
            "vertices": len(mesh.vertices),
            "faces": len(mesh.faces),
            "elapsed_s": round(elapsed, 2),
        }

    except Exception as e:
        log.error(f"Generation failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Generation failed: {str(e)}")


def _reduce_faces(mesh: trimesh.Trimesh, target_faces: int) -> trimesh.Trimesh:
    """Reduce face count using pymeshlab if available."""
    if target_faces <= 0 or mesh.faces.shape[0] <= target_faces:
        return mesh
    try:
        import pymeshlab
        ms = pymeshlab.MeshSet()
        ms.add_mesh(pymeshlab.Mesh(
            vertex_matrix=mesh.vertices,
            face_matrix=mesh.faces,
        ))
        ms.meshing_merge_close_vertices()
        ms.meshing_decimation_quadric_edge_collapse(targetfacenum=target_faces)
        cm = ms.current_mesh()
        mesh = trimesh.Trimesh(
            vertices=cm.vertex_matrix(),
            faces=cm.face_matrix(),
        )
        log.info(f"Mesh simplified to {target_faces} faces")
    except Exception as e:
        log.warning(f"Face reduction failed, using full mesh: {e}")
    return mesh


def _generate_hunyuan3d(
    prompt: str | None = None,
    image: Image.Image | None = None,
    seed: int = 42,
    faces: int = -1,
) -> dict:
    """Generate a 3D mesh using Hunyuan3D.

    Pipeline:
      - If only `prompt` given → text-to-image (HunyuanDiT) → image-to-3D
      - If `image` given → image-to-3D directly
    """
    import torch

    pipe = get_hunyuan3d_model()
    if pipe is None:
        raise HTTPException(503, "Hunyuan3D model not available. Check installation.")

    start = time.time()

    # Step 1: Convert text prompt to image if needed
    if image is None and prompt:
        log.info(f"Text-to-image: {prompt!r}")
        text2img = get_hunyuan3d_text2img()
        if text2img is None:
            raise HTTPException(
                503,
                "HunyuanDiT text-to-image model not available. "
                "Provide an image instead of a text prompt.",
            )
        image = text2img(prompt, seed=seed)
        log.info("Text-to-image complete, proceeding to shape generation")

    if image is None:
        raise HTTPException(400, "No image or text prompt provided")

    # Ensure RGBA for background removal compatibility
    if image.mode != "RGBA":
        image = image.convert("RGBA")

    log.info(f"Hunyuan3D shape gen: image size={image.size}, seed={seed}")

    # Step 2: Image → 3D mesh
    mesh = pipe(
        image=image,
        num_inference_steps=50,
        octree_resolution=380,
        num_chunks=20000,
        generator=torch.manual_seed(seed),
        output_type="trimesh",
    )[0]  # Returns trimesh.Trimesh

    # Optional face reduction
    mesh = _reduce_faces(mesh, faces)

    elapsed = time.time() - start
    log.info(
        f"Hunyuan3D done: {elapsed:.1f}s, "
        f"{len(mesh.vertices)} verts, {len(mesh.faces)} faces"
    )

    # Save GLB
    part_id = f"h3d_{uuid.uuid4().hex[:8]}"
    output_path = OUTPUT_DIR / f"{part_id}.glb"
    mesh.export(str(output_path))
    log.info(f"Saved GLB: {output_path} ({os.path.getsize(output_path)} bytes)")

    # Include ref image path if we generated one from text
    result = {
        "part_id": part_id,
        "glb_path": f"/parts/generated/{part_id}.glb",
        "vertices": len(mesh.vertices),
        "faces": len(mesh.faces),
        "elapsed_s": round(elapsed, 2),
        "engine": "hunyuan3d",
    }
    if prompt and image is not None:
        # Save ref image for painting (if text-to-image path was used)
        paint_ref_id = f"paintref_{part_id}"
        paint_ref_path = OUTPUT_DIR / f"{paint_ref_id}.png"
        image.save(str(paint_ref_path))
        result["ref_image_path"] = f"/parts/generated/{paint_ref_id}.png"
    return result


# ── POST /generate-text — Text → 3D Mesh (Hunyuan3D) ────


@app.post("/generate-text")
async def generate_text_3d(req: GenerateTextRequest):
    """Generate a 3D .glb mesh from a text prompt using Hunyuan3D."""
    if not req.prompt.strip():
        raise HTTPException(400, "Text prompt cannot be empty")

    try:
        # Unload TripoSG to free VRAM for Hunyuan3D
        unload_triposg()
        return _generate_hunyuan3d(
            prompt=req.prompt.strip(),
            seed=req.seed,
            faces=req.faces,
        )
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Text-to-3D generation failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Text-to-3D generation failed: {str(e)}")


# ── POST /search-image — DuckDuckGo + rembg ─────────────


@app.post("/search-image")
async def search_image(req: SearchImageRequest):
    """Search for a reference image and optionally remove background."""
    try:
        from duckduckgo_search import DDGS

        log.info(f"Searching images for: {req.query}")
        with DDGS() as ddgs:
            results = list(ddgs.images(req.query, max_results=5))

        if not results:
            return {"images": [], "message": "No images found"}

        # Download first result
        import httpx

        image_url = results[0]["image"]
        log.info(f"Downloading: {image_url}")

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(image_url)
            resp.raise_for_status()

        image = Image.open(BytesIO(resp.content)).convert("RGBA")

        # Remove background if requested
        if req.remove_bg:
            try:
                import rembg

                image = rembg.remove(image)
                log.info("Background removed")
            except ImportError:
                log.warning("rembg not installed")

        # Save to temp
        img_id = f"ref_{uuid.uuid4().hex[:8]}"
        img_path = OUTPUT_DIR / f"{img_id}.png"
        image.save(str(img_path))

        return {
            "image_id": img_id,
            "image_path": f"/parts/generated/{img_id}.png",
            "source_url": image_url,
            "size": [image.size[0], image.size[1]],
            "all_results": [
                {"url": r["image"], "title": r.get("title", "")} for r in results[:5]
            ],
        }

    except ImportError:
        raise HTTPException(
            503,
            "duckduckgo_search not installed. pip install duckduckgo_search httpx",
        )
    except Exception as e:
        log.error(f"Image search failed: {e}")
        raise HTTPException(500, f"Image search failed: {str(e)}")


# ── POST /merge — Combine GLB Parts ─────────────────────


@app.post("/merge")
async def merge_parts(req: MergeRequest):
    """Merge multiple GLB parts into a single mesh using trimesh."""
    log.info(f"Merging {len(req.parts)} parts into '{req.output_name}'")

    combined = trimesh.Scene()
    for i, part in enumerate(req.parts):
        part_path = PROJECT_ROOT / part["path"].lstrip("/")
        if not part_path.exists():
            raise HTTPException(404, f"Part not found: {part['path']}")

        mesh = trimesh.load(str(part_path))
        pos = part.get("position", [0, 0, 0])
        rot = part.get("rotation", [0, 0, 0])

        # Apply transform
        transform = trimesh.transformations.compose_matrix(
            translate=pos,
            angles=[np.radians(r) for r in rot],
        )

        if isinstance(mesh, trimesh.Scene):
            for name, geom in mesh.geometry.items():
                combined.add_geometry(geom, transform=transform, node_name=f"part_{i}_{name}")
        else:
            combined.add_geometry(mesh, transform=transform, node_name=f"part_{i}")

    # Export merged
    output_path = OUTPUT_DIR / f"{req.output_name}.glb"
    combined.export(str(output_path))
    log.info(
        f"Merged mesh saved: {output_path} ({os.path.getsize(output_path)} bytes)"
    )

    return {
        "merged_path": f"/parts/generated/{req.output_name}.glb",
        "parts_count": len(req.parts),
        "file_size": os.path.getsize(output_path),
    }


# ── Slot-Based Assembly System ───────────────────────────

# 12 attachment slots — positions relative to bounding box dimensions.
# Format: [x_frac, y_frac, z_frac] where fractions are of bbox size,
# measured from bbox min corner.
SLOT_MAP: dict[str, list[float]] = {
    "head":        [0.50, 1.00, 0.50],   # top center
    "left_hand":   [0.10, 0.55, 0.50],   # left side, mid-upper
    "right_hand":  [0.90, 0.55, 0.50],   # right side, mid-upper
    "left_arm":    [0.15, 0.65, 0.50],   # left side, upper
    "right_arm":   [0.85, 0.65, 0.50],   # right side, upper
    "chest_front": [0.50, 0.65, 0.85],   # center front, upper
    "chest_back":  [0.50, 0.65, 0.15],   # center back, upper
    "waist":       [0.50, 0.40, 0.50],   # center, mid
    "left_leg":    [0.30, 0.10, 0.50],   # left side, bottom
    "right_leg":   [0.70, 0.10, 0.50],   # right side, bottom
    "top":         [0.50, 1.10, 0.50],   # above top
    "bottom":      [0.50, -0.05, 0.50],  # below bottom
}


def get_slot_position(base_mesh: trimesh.Trimesh, slot: str) -> np.ndarray:
    """Calculate world position for a named slot on a mesh's bounding box."""
    if slot not in SLOT_MAP:
        log.warning(f"Unknown slot '{slot}', defaulting to 'top'")
        slot = "top"

    bb_min, bb_max = base_mesh.bounds  # [[min_x,y,z], [max_x,y,z]]
    size = bb_max - bb_min
    fracs = np.array(SLOT_MAP[slot])
    return bb_min + size * fracs


def extract_single_mesh(loaded) -> trimesh.Trimesh:
    """Extract a single Trimesh from a loaded GLB (may be Scene or Trimesh)."""
    if isinstance(loaded, trimesh.Trimesh):
        return loaded
    if isinstance(loaded, trimesh.Scene) and len(loaded.geometry) > 0:
        # Concatenate all geometries in the scene
        meshes = list(loaded.geometry.values())
        if len(meshes) == 1:
            return meshes[0]
        return trimesh.util.concatenate(meshes)
    raise ValueError("Could not extract a valid mesh from the loaded file")


# ── POST /assemble — Full LLM-Driven Assembly ────────────


@app.post("/assemble")
async def assemble_bot(req: AssembleRequest):
    """Orchestrate full assembly: generate parts → position at slots → merge → optional rig."""
    log.info(f"Assembling bot: base='{req.base_description}', {len(req.attachments)} attachments")
    generated_parts: list[dict] = []  # Track generated assets for response

    try:
        # ── Step 1: Get or generate base mesh ──
        if req.base_glb_path:
            base_path = PROJECT_ROOT / req.base_glb_path.lstrip("/")
            if not base_path.exists():
                raise HTTPException(404, f"Base GLB not found: {req.base_glb_path}")
            log.info(f"Using existing base GLB: {base_path}")
        elif req.base_text_prompt and req.base_engine == "hunyuan3d":
            # Text-to-3D via Hunyuan3D
            log.info(f"Generating base mesh from text: '{req.base_text_prompt}'")
            unload_triposg()  # Free VRAM for Hunyuan3D
            base_result = _generate_hunyuan3d(prompt=req.base_text_prompt)
            base_path = OUTPUT_DIR / f"{base_result['part_id']}.glb"
            # Save ref image path for auto-paint later
            base_ref_image = base_result.get("ref_image_path", "")
            generated_parts.append({"role": "base", **base_result})
        else:
            # Image-to-3D via TripoSG (default) or Hunyuan3D
            base_image_path = req.base_image_path
            if not base_image_path and req.base_search_query:
                search_result = await search_image(SearchImageRequest(
                    query=req.base_search_query, remove_bg=True
                ))
                base_image_path = search_result.get("image_path", "")
                log.info(f"Searched base image: {base_image_path}")

            if not base_image_path:
                raise HTTPException(400, "No base mesh source: provide glb_path, text_prompt, image_path, or search_query")

            log.info(f"Generating base mesh from image (engine={req.base_engine})...")
            if req.base_engine == "hunyuan3d":
                unload_triposg()
                img = Image.open(PROJECT_ROOT / base_image_path.lstrip("/"))
                base_result = _generate_hunyuan3d(image=img)
            else:
                with open(PROJECT_ROOT / base_image_path.lstrip("/"), "rb") as f:
                    image_data = f.read()
                base_result = await _generate_from_bytes(
                    image_data, "base.png",
                    num_inference_steps=req.num_inference_steps,
                    guidance_scale=req.guidance_scale,
                )
            base_path = OUTPUT_DIR / f"{base_result['part_id']}.glb"
            generated_parts.append({"role": "base", **base_result})

        # Load base mesh
        base_loaded = trimesh.load(str(base_path))
        base_mesh = extract_single_mesh(base_loaded)
        log.info(f"Base mesh: {len(base_mesh.vertices)} verts, bounds={base_mesh.bounds.tolist()}")

        # ── Step 2: Generate + position attachments ──
        positioned_meshes = [base_mesh]  # Start with base

        for i, att in enumerate(req.attachments):
            log.info(f"Processing attachment {i+1}/{len(req.attachments)}: '{att.description}' → slot '{att.slot}'")

            if att.glb_path:
                att_path = PROJECT_ROOT / att.glb_path.lstrip("/")
                if not att_path.exists():
                    raise HTTPException(404, f"Attachment GLB not found: {att.glb_path}")
            elif att.text_prompt and att.engine == "hunyuan3d":
                # Text-to-3D via Hunyuan3D for this attachment
                log.info(f"Generating '{att.description}' from text: '{att.text_prompt}'")
                unload_triposg()
                att_result = _generate_hunyuan3d(prompt=att.text_prompt)
                att_path = OUTPUT_DIR / f"{att_result['part_id']}.glb"
                generated_parts.append({"role": att.description, "slot": att.slot, **att_result})
            else:
                # Image-to-3D path
                att_image_path = att.image_path
                if not att_image_path and att.search_query:
                    search_result = await search_image(SearchImageRequest(
                        query=att.search_query, remove_bg=True
                    ))
                    att_image_path = search_result.get("image_path", "")

                if not att_image_path:
                    log.warning(f"Skipping attachment '{att.description}': no image or text prompt")
                    continue

                log.info(f"Generating mesh for '{att.description}' (engine={att.engine})...")
                if att.engine == "hunyuan3d":
                    unload_triposg()
                    img = Image.open(PROJECT_ROOT / att_image_path.lstrip("/"))
                    att_result = _generate_hunyuan3d(image=img)
                else:
                    with open(PROJECT_ROOT / att_image_path.lstrip("/"), "rb") as f:
                        att_data = f.read()
                    att_result = await _generate_from_bytes(
                        att_data, f"att_{i}.png",
                        num_inference_steps=req.num_inference_steps,
                        guidance_scale=req.guidance_scale,
                    )
                att_path = OUTPUT_DIR / f"{att_result['part_id']}.glb"
                generated_parts.append({"role": att.description, "slot": att.slot, **att_result})

            # Load attachment mesh
            att_loaded = trimesh.load(str(att_path))
            att_mesh = extract_single_mesh(att_loaded)

            # Scale attachment relative to base
            if att.scale != 1.0:
                att_mesh.apply_scale(att.scale)

            # Calculate slot position and center attachment there
            slot_pos = get_slot_position(base_mesh, att.slot)
            att_center = att_mesh.centroid
            translation = slot_pos - att_center
            att_mesh.apply_translation(translation)
            log.info(f"Positioned '{att.description}' at slot '{att.slot}': {slot_pos.tolist()}")

            positioned_meshes.append(att_mesh)

        # ── Unload shape models before merge — not needed anymore ──
        unload_hunyuan3d()
        unload_triposg()

        # ── Step 3: Merge all parts ──
        log.info(f"Merging {len(positioned_meshes)} meshes...")
        merged = trimesh.util.concatenate(positioned_meshes)
        merged_path = OUTPUT_DIR / f"{req.output_name}.glb"
        merged.export(str(merged_path))
        log.info(f"Merged mesh: {len(merged.vertices)} verts, {len(merged.faces)} faces")

        result = {
            "merged_path": f"/parts/generated/{req.output_name}.glb",
            "vertices": len(merged.vertices),
            "faces": len(merged.faces),
            "parts_generated": generated_parts,
            "file_size": os.path.getsize(merged_path),
        }

        # ── Step 4: Optional auto-rig (non-fatal) ──
        if req.auto_rig:
            try:
                log.info("Auto-rigging merged mesh...")
                rig_result = await rig_bot(RigRequest(
                    glb_path=f"/parts/generated/{req.output_name}.glb",
                    output_name=f"{req.output_name}_rigged",
                ))
                result["rigged"] = rig_result
            except Exception as rig_err:
                log.warning(f"Auto-rigging failed (non-fatal): {rig_err}")
                result["rig_error"] = str(rig_err)

        # ── Step 5: Optional auto-paint (non-fatal) ──
        if req.auto_paint:
            try:
                # Prefer the generated reference image over searching the web
                paint_image = locals().get("base_ref_image", "")
                paint_query = (
                    req.paint_search_query
                    or req.base_description
                    or "3D robot texture material"
                )
                if paint_image:
                    log.info(f"Auto-painting with generated ref image: {paint_image}")
                else:
                    log.info(f"Auto-painting with search query: {paint_query}")
                paint_result = await paint_bot(PaintRequest(
                    glb_path=result["merged_path"],
                    image_path=paint_image,
                    search_query=paint_query if not paint_image else "",
                    output_name=f"{req.output_name}_painted",
                ))
                result["painted"] = paint_result
                # Update merged_path to the painted version
                result["merged_path"] = paint_result["painted_path"]
                result["file_size"] = paint_result["file_size"]
                log.info(f"Auto-paint complete: {paint_result['elapsed']}s")
            except Exception as paint_err:
                log.warning(f"Auto-painting failed (non-fatal): {paint_err}")
                result["paint_error"] = str(paint_err)

        return result

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Assembly failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Assembly failed: {str(e)}")


async def _generate_from_bytes(
    image_bytes: bytes,
    filename: str,
    num_inference_steps: int = 50,
    guidance_scale: float = 7.0,
    seed: int = 42,
    faces: int = -1,
) -> dict:
    """Internal helper: run TripoSG on raw image bytes. Returns result dict."""
    import torch
    from image_process import prepare_image
    import tempfile

    pipe, rmbg = get_triposg_models()
    if pipe is None:
        raise HTTPException(503, "TripoSG model not available")

    image = Image.open(BytesIO(image_bytes))
    log.info(f"  _generate_from_bytes: {filename} ({image.size[0]}x{image.size[1]})")

    # Save to temp file for prepare_image
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        image.save(tmp, format="PNG")
        tmp_path = tmp.name

    try:
        img_pil = prepare_image(
            tmp_path,
            bg_color=np.array([1.0, 1.0, 1.0]),
            rmbg_net=rmbg,
        )
    finally:
        os.unlink(tmp_path)

    start = time.time()
    with torch.no_grad():
        outputs = pipe(
            image=img_pil,
            generator=torch.Generator(device=pipe.device).manual_seed(seed),
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
        ).samples[0]

    mesh = trimesh.Trimesh(
        outputs[0].astype(np.float32),
        np.ascontiguousarray(outputs[1]),
    )

    # Optional face reduction
    if faces > 0 and mesh.faces.shape[0] > faces:
        try:
            import pymeshlab
            ms = pymeshlab.MeshSet()
            ms.add_mesh(pymeshlab.Mesh(
                vertex_matrix=mesh.vertices,
                face_matrix=mesh.faces,
            ))
            ms.meshing_merge_close_vertices()
            ms.meshing_decimation_quadric_edge_collapse(targetfacenum=faces)
            cm = ms.current_mesh()
            mesh = trimesh.Trimesh(
                vertices=cm.vertex_matrix(),
                faces=cm.face_matrix(),
            )
        except Exception as e:
            log.warning(f"Face reduction failed: {e}")

    elapsed = time.time() - start
    part_id = f"gen_{uuid.uuid4().hex[:8]}"
    output_path = OUTPUT_DIR / f"{part_id}.glb"
    mesh.export(str(output_path))

    return {
        "part_id": part_id,
        "glb_path": f"/parts/generated/{part_id}.glb",
        "vertices": len(mesh.vertices),
        "faces": len(mesh.faces),
        "elapsed_s": round(elapsed, 2),
    }


# ── POST /rig — Auto-Rig via UniRig ─────────────────────


@app.post("/rig")
async def rig_bot(req: RigRequest):
    """Auto-rig a GLB mesh using the UniRig pipeline."""
    # Web paths like /parts/generated/X.glb map to public/parts/generated/X.glb
    raw_path = req.glb_path.lstrip("/")
    glb_path = PROJECT_ROOT / "public" / raw_path
    if not glb_path.exists():
        # Fallback: try without public/ prefix
        glb_path = PROJECT_ROOT / raw_path
    if not glb_path.exists():
        raise HTTPException(404, f"GLB not found: {req.glb_path}")

    # Ensure TripoSG is unloaded (UniRig needs VRAM)
    unload_triposg()

    log.info(f"Rigging: {glb_path}")

    try:
        # UniRig uses its own Conda environment
        unirig_python = Path(r"D:\Miniconda3\envs\UniRig\python.exe")
        if not unirig_python.exists():
            raise HTTPException(
                503,
                "UniRig Conda env not found at D:\\Miniconda3\\envs\\UniRig. "
                "Create it with: conda create -n UniRig python=3.11",
            )

        rig_wrapper = UNIRIG_DIR / "rig_bot.py"
        if not rig_wrapper.exists():
            raise HTTPException(503, f"UniRig wrapper not found: {rig_wrapper}")

        output_glb = OUTPUT_DIR / f"{req.output_name}.glb"

        # Call the rig_bot.py wrapper which handles:
        # 1. Extract mesh → .npz
        # 2. Predict skeleton → .fbx
        # 3. Predict skin weights → .fbx
        # 4. Merge → rigged .glb
        cmd = [
            str(unirig_python),
            str(rig_wrapper),
            f"--input={str(glb_path)}",
            f"--output={str(output_glb)}",
        ]
        log.info(f"Running UniRig pipeline: {' '.join(cmd[:3])}...")

        result = subprocess.run(
            cmd,
            cwd=str(UNIRIG_DIR),
            capture_output=True,
            text=True,
            timeout=300,  # 5min timeout for large meshes
        )

        if result.stdout:
            log.info(f"UniRig stdout:\n{result.stdout[-500:]}")
        if result.stderr:
            log.warning(f"UniRig stderr:\n{result.stderr[-500:]}")

        if result.returncode != 0:
            log.error(f"UniRig failed (exit {result.returncode})")
            raise HTTPException(
                500,
                f"UniRig rigging failed: {result.stderr[-500:] if result.stderr else 'unknown error'}",
            )

        # Check output
        response: dict = {
            "glb_input": req.glb_path,
            "output_name": req.output_name,
        }

        if output_glb.exists():
            response["rigged_path"] = f"/parts/generated/{req.output_name}.glb"
            response["file_size"] = os.path.getsize(output_glb)
            log.info(f"Rigging complete: {output_glb} ({response['file_size']} bytes)")
        else:
            response["rigged_path"] = None
            response["message"] = "UniRig completed but output GLB not generated"
            log.warning("UniRig completed but no output file found")

        return response

    except subprocess.TimeoutExpired:
        raise HTTPException(504, "Rigging timed out (300s limit)")
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Rigging failed: {e}")
        raise HTTPException(500, f"Rigging failed: {str(e)}")


# ── POST /paint — Texture via Hunyuan3D-Paint ────────────


@app.post("/paint")
async def paint_bot(req: PaintRequest):
    """Apply AI-generated textures to a GLB mesh using Hunyuan3D-Paint."""
    # Resolve GLB path (web path → disk path)
    raw_path = req.glb_path.lstrip("/")
    glb_path = PROJECT_ROOT / "public" / raw_path
    if not glb_path.exists():
        glb_path = PROJECT_ROOT / raw_path
    if not glb_path.exists():
        raise HTTPException(404, f"GLB not found: {req.glb_path}")

    log.info(f"Painting: {glb_path}")

    try:
        # Get or find a reference image for texture guidance
        ref_image = None
        if req.image_path:
            img_path = PROJECT_ROOT / "public" / req.image_path.lstrip("/")
            if not img_path.exists():
                img_path = PROJECT_ROOT / req.image_path.lstrip("/")
            if img_path.exists():
                ref_image = Image.open(img_path).convert("RGBA")
                log.info(f"Using reference image: {img_path}")

        if ref_image is None and req.search_query:
            search_result = await search_image(SearchImageRequest(
                query=req.search_query, remove_bg=True
            ))
            found_path = search_result.get("image_path", "")
            if found_path:
                img_path = PROJECT_ROOT / "public" / found_path.lstrip("/")
                if not img_path.exists():
                    img_path = PROJECT_ROOT / found_path.lstrip("/")
                if img_path.exists():
                    ref_image = Image.open(img_path).convert("RGBA")
                    log.info(f"Using searched image: {img_path}")

        if ref_image is None:
            # Generate a default reference from the mesh description
            raise HTTPException(
                400,
                "No reference image provided. Please supply image_path or search_query "
                "for texture guidance.",
            )

        # Free shape model VRAM — paint model needs ~10GB
        unload_hunyuan3d()
        unload_triposg()

        # Load paint pipeline
        paint_pipe = get_hunyuan3d_paint()
        if paint_pipe is None:
            raise HTTPException(503, "Hunyuan3D-Paint not available")

        # Load mesh
        loaded = trimesh.load(str(glb_path))
        mesh = extract_single_mesh(loaded)
        log.info(
            f"Loaded mesh for painting: {len(mesh.vertices)} verts, "
            f"{len(mesh.faces)} faces"
        )

        # Decimate if too large — paint pipeline struggles with >50K faces
        MAX_PAINT_FACES = 50_000
        if len(mesh.faces) > MAX_PAINT_FACES:
            log.info(
                f"Mesh too large for painting ({len(mesh.faces)} faces), "
                f"decimating to {MAX_PAINT_FACES}..."
            )
            try:
                mesh = mesh.simplify_quadric_decimation(
                    face_count=MAX_PAINT_FACES
                )
                log.info(
                    f"Decimated mesh: {len(mesh.vertices)} verts, "
                    f"{len(mesh.faces)} faces"
                )
            except Exception as dec_err:
                log.warning(f"Decimation failed, using original: {dec_err}")

        # Run texture generation
        t0 = time.time()
        log.info("Running Hunyuan3D-Paint texture generation...")
        textured_mesh = paint_pipe(mesh, image=ref_image)
        elapsed = time.time() - t0
        log.info(f"Texture generation complete: {elapsed:.1f}s")

        # Export textured GLB
        output_path = OUTPUT_DIR / f"{req.output_name}.glb"
        textured_mesh.export(str(output_path))
        file_size = os.path.getsize(output_path)
        log.info(f"Saved textured GLB: {output_path} ({file_size} bytes)")

        # Free paint model VRAM immediately — it's huge (~10GB)
        unload_hunyuan3d_paint()

        return {
            "painted_path": f"/parts/generated/{req.output_name}.glb",
            "file_size": file_size,
            "elapsed": round(elapsed, 1),
            "reference_image": req.image_path or req.search_query,
        }

    except HTTPException:
        unload_hunyuan3d_paint()
        raise
    except Exception as e:
        unload_hunyuan3d_paint()
        log.error(f"Painting failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Painting failed: {str(e)}")


# ── Static file serving for generated parts ──────────────


@app.get("/parts/generated/{filename}")
async def serve_generated(filename: str):
    """Serve generated files from the output directory."""
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(404, f"File not found: {filename}")
    return FileResponse(str(file_path))


# ── Main ─────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8100)
