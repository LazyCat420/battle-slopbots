"use client";

/**
 * Bot Assembly Lab — Slot-based assembly builder.
 *
 * Build custom chimera bots:
 * - Pick a base mesh (text-to-3D via Hunyuan3D, or image-to-3D via TripoSG)
 * - Add attachments to named slots (head, hands, chest, etc.)
 * - Each part can use a different engine
 * - Preview + download the merged GLB
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
	type AssembleRequest,
	type AssembleResult,
	type AssemblyAttachmentReq,
	assembleBot as assembleBotAPI,
	checkHealth,
	paintBot as paintBotAPI,
	pipelineFileUrl,
} from "@/lib/3d/pipeline-client";
import "./assemble.css";

// ── Slot definitions ─────────────────────────────────────

const SLOTS = [
	"head",
	"left_hand",
	"right_hand",
	"left_arm",
	"right_arm",
	"chest_front",
	"chest_back",
	"waist",
	"left_leg",
	"right_leg",
	"top",
	"bottom",
] as const;

type SlotName = (typeof SLOTS)[number];

// ── Types ────────────────────────────────────────────────

interface Attachment {
	id: string;
	description: string;
	textPrompt: string;
	searchQuery: string;
	slot: SlotName;
	scale: number;
	engine: "triposg" | "hunyuan3d";
}

function newAttachment(): Attachment {
	return {
		id: crypto.randomUUID(),
		description: "",
		textPrompt: "",
		searchQuery: "",
		slot: "right_hand",
		scale: 1.0,
		engine: "hunyuan3d",
	};
}

// ── Component ────────────────────────────────────────────

export default function AssemblePage() {
	// ── State ──
	const [healthy, setHealthy] = useState<boolean | null>(null);
	const [baseDesc, setBaseDesc] = useState("humanoid in T-pose");
	const [baseTextPrompt, setBaseTextPrompt] = useState(
		"a humanoid robot in T-pose",
	);
	const [baseSearchQuery, setBaseSearchQuery] = useState("");
	const [baseEngine, setBaseEngine] = useState<"triposg" | "hunyuan3d">(
		"hunyuan3d",
	);
	const [attachments, setAttachments] = useState<Attachment[]>([]);
	const [outputName, setOutputName] = useState("assembled_bot");
	const [autoRig, setAutoRig] = useState(false);
	const [autoPaint, setAutoPaint] = useState(true);
	const [assembling, setAssembling] = useState(false);
	const [painting, setPainting] = useState(false);
	const [result, setResult] = useState<AssembleResult | null>(null);
	const [status, setStatus] = useState<{
		msg: string;
		type: "info" | "success" | "error";
	} | null>(null);
	const [logs, setLogs] = useState<string[]>([]);

	// ── Three.js refs ──
	const canvasRef = useRef<HTMLDivElement>(null);
	const sceneRef = useRef<THREE.Scene | null>(null);
	const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
	const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
	const controlsRef = useRef<OrbitControls | null>(null);
	const modelRef = useRef<THREE.Group | null>(null);
	const frameRef = useRef<number>(0);

	// ── Health check ──
	useEffect(() => {
		checkHealth().then(setHealthy);
	}, []);

	// ── Three.js Setup ──
	useEffect(() => {
		if (!canvasRef.current) return;

		const container = canvasRef.current;
		const w = container.clientWidth;
		const h = Math.max(500, container.clientHeight);

		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0x0d1117);
		sceneRef.current = scene;

		const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
		camera.position.set(0, 1.5, 4);
		cameraRef.current = camera;

		const renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(w, h);
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.2;
		container.appendChild(renderer.domElement);
		rendererRef.current = renderer;

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.05;
		controls.target.set(0, 0.8, 0);
		controlsRef.current = controls;

		// Lights
		const ambient = new THREE.AmbientLight(0xffffff, 0.6);
		scene.add(ambient);
		const dir = new THREE.DirectionalLight(0xffffff, 1.2);
		dir.position.set(3, 5, 4);
		scene.add(dir);
		const fill = new THREE.DirectionalLight(0x8888ff, 0.4);
		fill.position.set(-3, 2, -4);
		scene.add(fill);

		// Grid
		const grid = new THREE.GridHelper(10, 20, 0x30363d, 0x21262d);
		scene.add(grid);

		// Animate
		function animate() {
			frameRef.current = requestAnimationFrame(animate);
			controls.update();
			renderer.render(scene, camera);
		}
		animate();

		// Resize handler
		const handleResize = () => {
			const cw = container.clientWidth;
			const ch = Math.max(500, container.clientHeight);
			camera.aspect = cw / ch;
			camera.updateProjectionMatrix();
			renderer.setSize(cw, ch);
		};
		window.addEventListener("resize", handleResize);

		return () => {
			window.removeEventListener("resize", handleResize);
			cancelAnimationFrame(frameRef.current);
			renderer.dispose();
			if (container.contains(renderer.domElement)) {
				container.removeChild(renderer.domElement);
			}
		};
	}, []);

	// ── Load GLB into scene ──
	const loadGLB = useCallback((url: string) => {
		const scene = sceneRef.current;
		if (!scene) return;

		// Remove old model
		if (modelRef.current) {
			scene.remove(modelRef.current);
			modelRef.current = null;
		}

		const loader = new GLTFLoader();
		loader.load(url, (gltf) => {
			const model = gltf.scene;
			// Auto-center and scale
			const box = new THREE.Box3().setFromObject(model);
			const center = box.getCenter(new THREE.Vector3());
			const size = box.getSize(new THREE.Vector3());
			const maxDim = Math.max(size.x, size.y, size.z);
			const scale = 2 / maxDim;
			model.scale.setScalar(scale);
			model.position.sub(center.multiplyScalar(scale));
			model.position.y += size.y * scale * 0.5;

			// Apply wireframe material if no textures
			model.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					if (!child.material.map) {
						child.material = new THREE.MeshStandardMaterial({
							color: 0x58a6ff,
							metalness: 0.3,
							roughness: 0.6,
							wireframe: false,
						});
					}
				}
			});

			scene.add(model);
			modelRef.current = model;

			// Reposition camera
			if (cameraRef.current && controlsRef.current) {
				cameraRef.current.position.set(0, 1.5, 4);
				controlsRef.current.target.set(0, 1, 0);
			}
		});
	}, []);

	// ── Log helper ──
	const addLog = useCallback((msg: string) => {
		setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
	}, []);

	// ── Add/Remove attachments ──
	const addAttachment = useCallback(() => {
		setAttachments((prev) => [...prev, newAttachment()]);
	}, []);

	const removeAttachment = useCallback((id: string) => {
		setAttachments((prev) => prev.filter((a) => a.id !== id));
	}, []);

	const updateAttachment = useCallback(
		(id: string, updates: Partial<Attachment>) => {
			setAttachments((prev) =>
				prev.map((a) => (a.id === id ? { ...a, ...updates } : a)),
			);
		},
		[],
	);

	// ── Assemble ──
	const handleAssemble = useCallback(async () => {
		setAssembling(true);
		setResult(null);
		setLogs([]);
		setStatus({ msg: "Starting assembly...", type: "info" });
		addLog("Assembly started");

		try {
			const attReqs: AssemblyAttachmentReq[] = attachments
				.filter((a) => a.description.trim())
				.map((a) => ({
					description: a.description,
					text_prompt: a.engine === "hunyuan3d" ? a.textPrompt : "",
					search_query: a.engine === "triposg" ? a.searchQuery : "",
					slot: a.slot,
					scale: a.scale,
					engine: a.engine,
				}));

			const req: AssembleRequest = {
				base_description: baseDesc,
				base_text_prompt:
					baseEngine === "hunyuan3d" ? baseTextPrompt : undefined,
				base_search_query:
					baseEngine === "triposg" ? baseSearchQuery : undefined,
				base_engine: baseEngine,
				attachments: attReqs,
				output_name: outputName,
				auto_rig: autoRig,
				auto_paint: autoPaint,
			};

			addLog(
				`Sending request: ${attReqs.length} attachments, engine=${baseEngine}`,
			);
			addLog(
				`Base: ${baseEngine === "hunyuan3d" ? baseTextPrompt : baseSearchQuery}`,
			);

			const res = await assembleBotAPI(req);
			setResult(res);
			setStatus({ msg: "Assembly complete!", type: "success" });
			addLog(
				`Done! ${res.vertices} verts, ${res.faces} faces, ${(res.file_size / 1024).toFixed(1)}KB`,
			);

			// Load the merged GLB into the 3D preview
			loadGLB(pipelineFileUrl(res.merged_path));
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			setStatus({ msg: `Assembly failed: ${msg}`, type: "error" });
			addLog(`ERROR: ${msg}`);
		} finally {
			setAssembling(false);
		}
	}, [
		baseDesc,
		baseTextPrompt,
		baseSearchQuery,
		baseEngine,
		attachments,
		outputName,
		autoRig,
		autoPaint,
		addLog,
		loadGLB,
	]);

	// ── Download GLB ──
	const downloadGLB = useCallback(() => {
		if (!result) return;
		const url = pipelineFileUrl(result.merged_path);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${outputName}.glb`;
		a.click();
	}, [result, outputName]);

	// ── Paint Texture ──
	const handlePaint = useCallback(async () => {
		if (!result) return;
		const query = prompt("Enter a search query for the texture reference image:\n(e.g. 'robot metal texture', 'wooden mech')");
		if (!query) return;

		setPainting(true);
		setStatus({ msg: "🎨 Applying AI textures...", type: "info" });
		addLog(`Paint started with query: ${query}`);

		try {
			const paintResult = await paintBotAPI(result.merged_path, {
				searchQuery: query,
				outputName: `${outputName}_painted`,
			});

			setStatus({
				msg: `🎨 Texture applied! ${paintResult.elapsed}s, ${(paintResult.file_size / 1024).toFixed(1)}KB`,
				type: "success",
			});
			addLog(`Painted in ${paintResult.elapsed}s`);

			// Reload the textured GLB into the viewer
			loadGLB(pipelineFileUrl(paintResult.painted_path));

			// Update result path to painted version
			setResult((prev) =>
				prev ? { ...prev, merged_path: paintResult.painted_path, file_size: paintResult.file_size } : prev,
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			setStatus({ msg: `Paint failed: ${msg}`, type: "error" });
			addLog(`PAINT ERROR: ${msg}`);
		} finally {
			setPainting(false);
		}
	}, [result, outputName, addLog, loadGLB]);

	return (
		<div className="assemble-page">
			<h1>🔧 Bot Assembly Lab</h1>
			<p className="subtitle">
				Build chimera bots from text/image → 3D with slot-based attachments
				{healthy === false && <span> — ⚠️ Pipeline offline</span>}
				{healthy === true && <span> — ✅ Pipeline connected</span>}
			</p>

			<div className="assemble-layout">
				{/* ── Left Panel: Controls ── */}
				<div>
					{/* Base Mesh */}
					<div className="asm-panel">
						<h2>🏗️ Base Mesh</h2>

						<div className="asm-field">
							<label htmlFor="base-desc">Description</label>
							<input
								id="base-desc"
								type="text"
								value={baseDesc}
								onChange={(e) => setBaseDesc(e.target.value)}
								placeholder="e.g. humanoid in T-pose"
							/>
						</div>

						<div className="asm-field">
							<span className="asm-field-label">Engine</span>
							<div className="engine-toggle">
								<button
									type="button"
									className={baseEngine === "hunyuan3d" ? "active" : ""}
									onClick={() => setBaseEngine("hunyuan3d")}
								>
									🧠 Hunyuan3D (Text)
								</button>
								<button
									type="button"
									className={baseEngine === "triposg" ? "active" : ""}
									onClick={() => setBaseEngine("triposg")}
								>
									📷 TripoSG (Image)
								</button>
							</div>
						</div>

						{baseEngine === "hunyuan3d" ? (
							<div className="asm-field">
								<label htmlFor="base-text">Text Prompt</label>
								<textarea
									id="base-text"
									value={baseTextPrompt}
									onChange={(e) => setBaseTextPrompt(e.target.value)}
									placeholder="Describe the base mesh..."
								/>
							</div>
						) : (
							<div className="asm-field">
								<label htmlFor="base-search">Image Search Query</label>
								<input
									id="base-search"
									type="text"
									value={baseSearchQuery}
									onChange={(e) => setBaseSearchQuery(e.target.value)}
									placeholder="e.g. humanoid robot PNG transparent"
								/>
							</div>
						)}
					</div>

					{/* Attachments */}
					<div className="asm-panel asm-panel-mt">
						<h2>🔩 Attachments</h2>

						<div className="attachment-list">
							{attachments.map((att, idx) => (
								<div key={att.id} className="attachment-card">
									<div className="att-header">
										<span className="att-title">Part {idx + 1}</span>
										<button
											type="button"
											className="att-remove"
											onClick={() => removeAttachment(att.id)}
											title="Remove attachment"
										>
											✕
										</button>
									</div>

									<div className="asm-field">
										<label htmlFor={`att-desc-${att.id}`}>Description</label>
										<input
											id={`att-desc-${att.id}`}
											type="text"
											value={att.description}
											onChange={(e) =>
												updateAttachment(att.id, {
													description: e.target.value,
												})
											}
											placeholder="e.g. chainsaw"
										/>
									</div>

									<div className="att-row">
										<div className="asm-field">
											<label htmlFor={`att-slot-${att.id}`}>Slot</label>
											<select
												id={`att-slot-${att.id}`}
												value={att.slot}
												onChange={(e) =>
													updateAttachment(att.id, {
														slot: e.target.value as SlotName,
													})
												}
											>
												{SLOTS.map((s) => (
													<option key={s} value={s}>
														{s.replace(/_/g, " ")}
													</option>
												))}
											</select>
										</div>
										<div className="asm-field">
											<label htmlFor={`att-engine-${att.id}`}>Engine</label>
											<select
												id={`att-engine-${att.id}`}
												value={att.engine}
												onChange={(e) =>
													updateAttachment(att.id, {
														engine: e.target.value as "triposg" | "hunyuan3d",
													})
												}
											>
												<option value="hunyuan3d">🧠 Hunyuan3D</option>
												<option value="triposg">📷 TripoSG</option>
											</select>
										</div>
									</div>

									{att.engine === "hunyuan3d" ? (
										<div className="asm-field">
											<label htmlFor={`att-text-${att.id}`}>Text Prompt</label>
											<input
												id={`att-text-${att.id}`}
												type="text"
												value={att.textPrompt}
												onChange={(e) =>
													updateAttachment(att.id, {
														textPrompt: e.target.value,
													})
												}
												placeholder="e.g. a medieval sword"
											/>
										</div>
									) : (
										<div className="asm-field">
											<label htmlFor={`att-search-${att.id}`}>
												Search Query
											</label>
											<input
												id={`att-search-${att.id}`}
												type="text"
												value={att.searchQuery}
												onChange={(e) =>
													updateAttachment(att.id, {
														searchQuery: e.target.value,
													})
												}
												placeholder="e.g. chainsaw PNG transparent"
											/>
										</div>
									)}

									<div className="asm-field">
										<label htmlFor={`att-scale-${att.id}`}>Scale</label>
										<div className="scale-slider">
											<input
												id={`att-scale-${att.id}`}
												type="range"
												min="0.1"
												max="2.0"
												step="0.05"
												value={att.scale}
												onChange={(e) =>
													updateAttachment(att.id, {
														scale: parseFloat(e.target.value),
													})
												}
											/>
											<span className="scale-value">
												{att.scale.toFixed(2)}x
											</span>
										</div>
									</div>
								</div>
							))}
						</div>

						<button
							type="button"
							className="asm-btn asm-btn-secondary"
							onClick={addAttachment}
						>
							＋ Add Attachment
						</button>
					</div>

					{/* Actions */}
					<div className="asm-panel asm-panel-mt">
						<h2>⚡ Actions</h2>

						<div className="asm-field">
							<label htmlFor="output-name">Output Name</label>
							<input
								id="output-name"
								type="text"
								value={outputName}
								onChange={(e) => setOutputName(e.target.value)}
								placeholder="assembled_bot"
							/>
						</div>

						<div className="asm-field">
							<label>
								<input
									type="checkbox"
									checked={autoRig}
									onChange={(e) => setAutoRig(e.target.checked)}
								/>{" "}
								Auto-rig after assembly (UniRig)
							</label>
						</div>

						<div className="asm-field">
							<label>
								<input
									type="checkbox"
									checked={autoPaint}
									onChange={(e) => setAutoPaint(e.target.checked)}
								/>{" "}
								Auto-paint textures after assembly (Hunyuan3D-Paint)
							</label>
						</div>

						<div className="btn-row">
							<button
								type="button"
								className="asm-btn asm-btn-primary"
								disabled={assembling || healthy === false}
								onClick={handleAssemble}
							>
								{assembling ? (
									<>
										<span className="spinner" /> Assembling...
									</>
								) : (
									"🚀 Assemble Bot"
								)}
							</button>

							{result && (
								<button
									type="button"
									className="asm-btn asm-btn-success"
									onClick={downloadGLB}
								>
									💾 Download GLB
								</button>
							)}

						{result && (
							<button
								type="button"
								className="asm-btn asm-btn-secondary"
								disabled={painting}
								onClick={handlePaint}
								title="Apply AI-generated textures using Hunyuan3D-Paint"
							>
								{painting ? (
									<>
										<span className="spinner" /> Painting...
									</>
								) : (
									"🎨 Paint Texture"
								)}
							</button>
						)}
						</div>

						{status && (
							<div className={`asm-status ${status.type}`}>{status.msg}</div>
						)}

						{result && (
							<div className="result-stats">
								<div className="stat-card">
									<div className="stat-value">
										{result.vertices.toLocaleString()}
									</div>
									<div className="stat-label">Vertices</div>
								</div>
								<div className="stat-card">
									<div className="stat-value">
										{result.faces.toLocaleString()}
									</div>
									<div className="stat-label">Faces</div>
								</div>
								<div className="stat-card">
									<div className="stat-value">
										{(result.file_size / 1024).toFixed(1)}
									</div>
									<div className="stat-label">KB</div>
								</div>
								<div className="stat-card">
									<div className="stat-value">
										{result.parts_generated.length}
									</div>
									<div className="stat-label">Parts</div>
								</div>
							</div>
						)}

						{logs.length > 0 && (
							<div className="asm-log">
								{logs.map((l, i) => (
									<div key={`log-${l.slice(0, 20)}-${i}`} className="log-entry">
										{l}
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				{/* ── Right Panel: 3D Preview ── */}
				<div className="asm-panel">
					<h2>👁️ 3D Preview</h2>
					<div className="preview-container" ref={canvasRef}>
						{!result && (
							<div className="preview-overlay">
								Assemble a bot to see the preview
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
