/**
 * Pipeline Client — Frontend API wrapper for the 3D bot pipeline backend.
 *
 * All calls go to the Python FastAPI server on port 8100.
 * Provides typed methods for each pipeline endpoint.
 */

const PIPELINE_URL = "http://localhost:8100";

// ── Types ───────────────────────────────────────────────

export interface PipelineStatus {
	gpu: {
		available: boolean;
		name?: string;
		total_vram_gb?: number;
		allocated_gb?: number;
		reserved_gb?: number;
		free_gb?: number;
	};
	triposr_loaded: boolean;
	hunyuan3d_loaded: boolean;
	hunyuan3d_model: string;
	engines_available: string[];
	output_dir: string;
	generated_parts: number;
}

export interface GenerateResult {
	part_id: string;
	glb_path: string;
	vertices: number;
	faces: number;
	elapsed_s: number;
	engine?: string;
}

export interface SearchImageResult {
	image_id: string;
	image_path: string;
	source_url: string;
	size: [number, number];
	all_results: Array<{ url: string; title: string }>;
}

export interface MergeResult {
	merged_path: string;
	parts_count: number;
	file_size: number;
}

export interface RigResult {
	output_dir: string;
	glb_input: string;
	skin_json: string | null;
	bone_count?: number;
	vertex_count?: number;
	message?: string;
}

export interface MergePart {
	path: string;
	position: [number, number, number];
	rotation: [number, number, number];
}

export interface AssemblyAttachmentReq {
	description: string;
	search_query?: string;
	text_prompt?: string;
	image_path?: string;
	glb_path?: string;
	slot: string;
	scale?: number;
	engine?: string;
}

export interface AssembleRequest {
	base_description?: string;
	base_search_query?: string;
	base_text_prompt?: string;
	base_image_path?: string;
	base_glb_path?: string;
	base_engine?: string;
	attachments: AssemblyAttachmentReq[];
	output_name?: string;
	auto_rig?: boolean;
	auto_paint?: boolean;
	paint_search_query?: string;
}

export interface AssembleResult {
	merged_path: string;
	vertices: number;
	faces: number;
	parts_generated: Array<{
		role: string;
		part_id: string;
		glb_path: string;
		slot?: string;
		engine?: string;
	}>;
	file_size: number;
	rigged?: RigResult;
}

// ── API Client ──────────────────────────────────────────

export async function checkHealth(): Promise<boolean> {
	try {
		const resp = await fetch(`${PIPELINE_URL}/health`, {
			signal: AbortSignal.timeout(3000),
		});
		return resp.ok;
	} catch {
		return false;
	}
}

export async function getStatus(): Promise<PipelineStatus> {
	const resp = await fetch(`${PIPELINE_URL}/status`);
	if (!resp.ok) throw new Error(`Status failed: ${resp.statusText}`);
	return resp.json();
}

export async function searchImage(
	query: string,
	removeBg = true,
): Promise<SearchImageResult> {
	const resp = await fetch(`${PIPELINE_URL}/search-image`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ query, remove_bg: removeBg }),
	});
	if (!resp.ok) throw new Error(`Search failed: ${resp.statusText}`);
	return resp.json();
}

export async function generateMesh(
	imageFile: File | Blob,
	resolution = 256,
): Promise<GenerateResult> {
	const form = new FormData();
	form.append("file", imageFile);
	form.append("resolution", String(resolution));

	const resp = await fetch(`${PIPELINE_URL}/generate`, {
		method: "POST",
		body: form,
	});
	if (!resp.ok) throw new Error(`Generation failed: ${resp.statusText}`);
	return resp.json();
}

export async function generateFromText(
	prompt: string,
	seed = 42,
	faces = -1,
): Promise<GenerateResult> {
	const resp = await fetch(`${PIPELINE_URL}/generate-text`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ prompt, seed, faces }),
	});
	if (!resp.ok) throw new Error(`Text-to-3D failed: ${resp.statusText}`);
	return resp.json();
}

export async function assembleBot(
	req: AssembleRequest,
): Promise<AssembleResult> {
	const resp = await fetch(`${PIPELINE_URL}/assemble`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(req),
	});
	if (!resp.ok) throw new Error(`Assembly failed: ${resp.statusText}`);
	return resp.json();
}

export async function mergeParts(
	parts: MergePart[],
	outputName = "merged_bot",
): Promise<MergeResult> {
	const resp = await fetch(`${PIPELINE_URL}/merge`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ parts, output_name: outputName }),
	});
	if (!resp.ok) throw new Error(`Merge failed: ${resp.statusText}`);
	return resp.json();
}

export async function rigBot(
	glbPath: string,
	outputName = "rigged_bot",
): Promise<RigResult> {
	const resp = await fetch(`${PIPELINE_URL}/rig`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ glb_path: glbPath, output_name: outputName }),
	});
	if (!resp.ok) throw new Error(`Rigging failed: ${resp.statusText}`);
	return resp.json();
}

// ── Paint types ─────────────────────────────────────────

export interface PaintResult {
	painted_path: string;
	file_size: number;
	elapsed: number;
	reference_image: string;
}

export async function paintBot(
	glbPath: string,
	opts?: {
		imagePath?: string;
		searchQuery?: string;
		outputName?: string;
	},
): Promise<PaintResult> {
	const resp = await fetch(`${PIPELINE_URL}/paint`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			glb_path: glbPath,
			image_path: opts?.imagePath ?? "",
			search_query: opts?.searchQuery ?? "",
			output_name: opts?.outputName ?? "painted_bot",
		}),
	});
	if (!resp.ok) {
		const body = await resp.text();
		throw new Error(`Painting failed: ${body}`);
	}
	return resp.json();
}

/**
 * Get the full URL for a file served by the pipeline backend.
 */
export function pipelineFileUrl(path: string): string {
	return `${PIPELINE_URL}${path}`;
}
