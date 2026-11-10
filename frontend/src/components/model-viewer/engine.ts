/**
 * three.js scene for the model viewer: loads published glbs and applies the pipeline's viewer
 * contract (variants, runtime tints, hiding rules, FlatKit cel emulation, selective bloom).
 * Browser-only; import it dynamically.
 */

import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {RoomEnvironment} from "three/addons/environments/RoomEnvironment.js";
import {MeshoptDecoder} from "three/addons/libs/meshopt_decoder.module.js";
import {type GLTF, GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {EffectComposer} from "three/addons/postprocessing/EffectComposer.js";
import {OutputPass} from "three/addons/postprocessing/OutputPass.js";
import {RenderPass} from "three/addons/postprocessing/RenderPass.js";
import {ShaderPass} from "three/addons/postprocessing/ShaderPass.js";
import {UnrealBloomPass} from "three/addons/postprocessing/UnrealBloomPass.js";
import {clone as cloneSkinned} from "three/addons/utils/SkeletonUtils.js";
import {type HairMesh, type ModelPart, type ModelTints, modelUrl} from "~/lib/models";

export interface ModelInfo {
    /** Number of `KHR_materials_variants` variants (0 when the model has none). */
    variants: number;
    /** Indices of `randomVariant` / `columnVariant` alternatives. */
    alternatives: number[];
}

export interface ShowOptions {
    parts: ModelPart[];
    tints?: ModelTints;
    /** Re-fit the camera when this changes (and on the first show). */
    frameKey?: string;
    /** Camera direction from the target, used when fitting. */
    viewDirection?: [number, number, number];
}

export interface ShowResult {
    /** False when a newer `show()` replaced this one before it finished. */
    current: boolean;
    failed: string[];
}

type UnityExtras = {
    lod?: number;
    rendererEnabled?: boolean;
    active?: boolean;
    hairMesh?: HairMesh;
    randomVariant?: { index: number };
    columnVariant?: { index: number };
    shader?: string;
    props?: Record<string, any>;
    runtime?: string[];
    fallbackColor?: number[];
    colorWrite?: boolean;
    blend?: "additive";
    zWrite?: boolean;
};

const unity = (o: { userData?: any } | null | undefined): UnityExtras => o?.userData?.unity ?? {};

// ── Loading ───────────────────────────────────────────────────

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const gltfCache = new Map<string, Promise<GLTF>>();

function loadModel(path: string): Promise<GLTF> {
    let p = gltfCache.get(path);
    if (!p) {
        p = loader.loadAsync(modelUrl(path)).catch(e => {
            gltfCache.delete(path);
            throw e;
        });
        gltfCache.set(path, p);
    }
    return p;
}

const alternativeOf = (o: THREE.Object3D) => unity(o).randomVariant ?? unity(o).columnVariant;

export async function inspectModel(path: string): Promise<ModelInfo> {
    const gltf = await loadModel(path);
    const alts = new Set<number>();
    gltf.scene.traverse(o => {
        const a = alternativeOf(o);
        if (a) alts.add(a.index);
    });
    return {
        variants: gltf.parser.json.extensions?.KHR_materials_variants?.variants?.length ?? 0,
        alternatives: [...alts].sort((a, b) => a - b),
    };
}

/**
 * SkeletonUtils.clone() drops GLTFLoader's `parser.associations` (keyed by the original objects),
 * which variants need; remember each clone's source object instead.
 */
function instantiate(gltf: GLTF): THREE.Object3D {
    const inst = cloneSkinned(gltf.scene);
    const src: THREE.Object3D[] = [];
    const dst: THREE.Object3D[] = [];
    gltf.scene.traverse(o => src.push(o));
    inst.traverse(o => dst.push(o));
    dst.forEach((o, i) => {
        o.userData.__source = src[i];
    });
    return inst;
}

async function applyVariant(gltf: GLTF, root: THREE.Object3D, variant: number) {
    const parser = gltf.parser;
    const jobs: Promise<void>[] = [];
    root.traverse(o => {
        if (!(o as THREE.Mesh).isMesh) return;
        const assoc = parser.associations.get(o.userData.__source ?? o) as { meshes?: number; primitives?: number } | undefined;
        if (assoc?.meshes === undefined || assoc.primitives === undefined) return;
        const prim = parser.json.meshes[assoc.meshes].primitives[assoc.primitives];
        const mapping = prim.extensions?.KHR_materials_variants?.mappings.find((m: { variants: number[] }) => m.variants.includes(variant));
        if (!mapping) return;
        jobs.push(parser.getDependency("material", mapping.material).then(mat => {
            (o as THREE.Mesh).material = mat;
        }));
    });
    await Promise.all(jobs);
}

// ── Runtime tints ─────────────────────────────────────────────

/** "Color(r,g,b,a)" → raw (HDR) channels. */
function parseUnityColor(s: string | undefined): number[] | null {
    const m = /Color\(([^)]*)\)/.exec(s ?? "");
    return m ? m[1].split(",").map(Number) : null;
}

function setColorFromHex(mat: THREE.MeshStandardMaterial, hex: string | undefined) {
    if (hex) mat.color.setStyle(hex, THREE.SRGBColorSpace);
}

/** Unity HDR color = gamma base × power-of-two intensity. */
function setEmissionRaw(mat: THREE.MeshStandardMaterial, raw: number[] | null) {
    if (!raw) return;
    const peak = Math.max(raw[0], raw[1], raw[2]);
    const k = peak > 1 ? 2 ** Math.ceil(Math.log2(peak)) : 1;
    mat.emissive.setRGB(raw[0] / k, raw[1] / k, raw[2] / k, THREE.SRGBColorSpace);
    mat.emissiveIntensity = k;
}

let maskPatternMats: Promise<THREE.Material[]> | undefined;

function maskPatternMaterial(variant: number): Promise<THREE.Material | undefined> {
    maskPatternMats ??= loadModel("Customization/MaskPatterns").then(g => g.parser.getDependencies("material"));
    return maskPatternMats.then(m => m[variant]);
}

async function applyRuntime(root: THREE.Object3D, tints: ModelTints, created: THREE.Material[]) {
    const jobs: Promise<void>[] = [];
    root.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m, i) => {
            const rt = unity(m).runtime ?? [];
            if (!rt.length) return;
            jobs.push((async () => {
                let c = m as THREE.MeshStandardMaterial;
                // The pattern material replaces the mask shape's placeholder; its emission comes from the row.
                if (rt.includes("maskPattern") && tints.maskPattern) {
                    const pm = await maskPatternMaterial(tints.maskPattern.variant);
                    if (pm) {
                        c = pm.clone() as THREE.MeshStandardMaterial;
                        setEmissionRaw(c, parseUnityColor(tints.maskPattern.emission));
                    }
                }
                if (c === m) c = m.clone() as THREE.MeshStandardMaterial;
                created.push(c);
                const u = unity(c);
                if (rt.includes("bodyColor")) {
                    if (tints.bodyColor) setColorFromHex(c, tints.bodyColor.color);
                    else if (u.fallbackColor) c.color.fromArray(u.fallbackColor);
                }
                if (rt.includes("hairColor")) {
                    if (tints.hairColor) {
                        setColorFromHex(c, tints.hairColor.color);
                        if (c.emissiveMap) setEmissionRaw(c, parseUnityColor(tints.hairColor.emission));
                    } else if (u.fallbackColor) c.color.fromArray(u.fallbackColor);
                }
                if (rt.includes("hexTerrainColor") && u.fallbackColor) c.color.fromArray(u.fallbackColor);
                if (Array.isArray(mesh.material)) mesh.material[i] = c; else mesh.material = c;
            })());
        });
    });
    await Promise.all(jobs);
}

// ── Lighting ──────────────────────────────────────────────────

const srgb = (c: number[] | undefined, fallback: THREE.Color) =>
    c ? new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace) : fallback.clone();

/**
 * FlatKit "Stylized Surface" isn't PBR: the lit side is texture × _BaseColor and shadow steps lerp
 * toward absolute "Color Shaded" colors by N·L. PBR lighting over-brightens it, so emulate the cel steps.
 */
function flatKitMaterial(m: THREE.MeshStandardMaterial, sunDirView: { value: THREE.Vector3 }): THREE.Material {
    const p = unity(m).props ?? {};
    const base = srgb(p._BaseColor, new THREE.Color(1, 1, 1));
    // _CelPrimaryMode: KeywordEnum(None, Single, Steps, Curve).
    const mode = p._CelPrimaryMode ?? 1;
    const dim = mode === 1 ? p._ColorDim : mode === 2 ? p._ColorDimSteps : mode === 3 ? p._ColorDimCurve : null;
    const l = new THREE.MeshLambertMaterial({
        map: m.map, color: 0xffffff, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side,
        vertexColors: m.vertexColors, emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity,
    });
    l.userData = m.userData;
    const u = {
        uSun: sunDirView,
        uBase: {value: base},
        uDim: {value: dim ? srgb(dim, base) : base.clone()},
        uSize: {value: p._SelfShadingSize ?? 0.5}, uEdge: {value: Math.max(p._ShadowEdgeSize ?? 0.05, 1e-3)},
        uExtra: {value: p._CelExtraEnabled ? 1 : 0},
        uDimExtra: {value: srgb(p._ColorDimExtra, base)},
        uSizeExtra: {value: p._SelfShadingSizeExtra ?? 0.6}, uEdgeExtra: {value: Math.max(p._ShadowEdgeSizeExtra ?? 0.05, 1e-3)},
    };
    l.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, u);
        sh.fragmentShader = sh.fragmentShader
            .replace("#include <common>", `#include <common>
uniform vec3 uSun, uBase, uDim, uDimExtra; uniform float uSize, uEdge, uExtra, uSizeExtra, uEdgeExtra;`)
            .replace("#include <opaque_fragment>", `{
  float h = dot(normal, uSun) * 0.5 + 0.5;
  vec3 c = mix(uDim, uBase, smoothstep(0.0, uEdge, h - uSize));
  if (uExtra > 0.5) c = mix(uDimExtra, c, smoothstep(0.0, uEdgeExtra, h - uSizeExtra));
  outgoingLight = diffuseColor.rgb * c + totalEmissiveRadiance;
}
#include <opaque_fragment>`);
    };
    l.customProgramCacheKey = () => "flatkit";
    return l;
}

/**
 * FakePointLight draws a soft glow from a hard-edged hull. Fade the hull by how squarely it faces
 * the camera (silhouette edges vanish) and scale its opacity, so the glow reads as light rather
 * than a solid shell around the model.
 */
const LIGHT_HULL_OPACITY = 0.01;
function softenLightHull(m: THREE.MeshStandardMaterial) {
    // Materials can be shared between loads of the same model; scale only once.
    if (m.userData.lightHullSoftened) return;
    m.userData.lightHullSoftened = true;
    m.opacity *= LIGHT_HULL_OPACITY;
    m.onBeforeCompile = sh => {
        sh.fragmentShader = sh.fragmentShader.replace("#include <opaque_fragment>", `
diffuseColor.a *= pow(abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
#include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => "light-hull";
}

// ── Stage ─────────────────────────────────────────────────────

const BLACK = new THREE.MeshBasicMaterial({color: 0x000000});
const INVISIBLE = new THREE.MeshBasicMaterial({colorWrite: false, depthWrite: false});
const BLOOM_STRENGTH = 0.5;
/** Layer no camera renders: hides one object without hiding its children. */
const HIDDEN_LAYER = 1;
const DEFAULT_VIEW: [number, number, number] = [0.6, 0.35, 1];

export class ModelStage {
    readonly #renderer: THREE.WebGLRenderer;
    readonly #scene = new THREE.Scene();
    readonly #camera = new THREE.PerspectiveCamera(35, 1, 0.01, 2000);
    readonly #controls: OrbitControls;
    readonly #stage = new THREE.Group();
    readonly #sun = new THREE.DirectionalLight(0xffffff, 2);
    readonly #sunDirView = {value: new THREE.Vector3()};
    readonly #bloomComposer: EffectComposer;
    readonly #finalComposer: EffectComposer;
    readonly #emissionOnly = new WeakMap<THREE.Material, THREE.MeshBasicMaterial>();
    readonly #resizeObserver: ResizeObserver;
    #created: THREE.Material[] = [];
    #hasEmissive = false;
    #bloomWarmup = false;
    #buildId = 0;
    #framedKey: string | undefined;
    #view: { group: THREE.Object3D; direction: [number, number, number] } | undefined;
    #frameQueued = false;
    #disposed = false;

    constructor(canvas: HTMLCanvasElement, private readonly container: HTMLElement) {
        // The canvas is transparent and the container's CSS background shows through, so the backdrop
        // follows the page theme and never passes through the tone-mapping/bloom composers.
        this.#renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true});
        this.#renderer.setClearColor(0x000000, 0);
        this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.#renderer.toneMappingExposure = 0.9;
        this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const pmrem = new THREE.PMREMGenerator(this.#renderer);
        this.#scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
        this.#scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.2));
        this.#sun.position.set(3, 5, 4);
        this.#scene.add(this.#sun, this.#stage);

        this.#controls = new OrbitControls(this.#camera, canvas);
        this.#controls.addEventListener("change", this.#requestRender);

        // Selective bloom: a separate pass renders only emission, blurs it, and adds it on top.
        this.#bloomComposer = new EffectComposer(this.#renderer);
        this.#bloomComposer.renderToScreen = false;
        this.#bloomComposer.addPass(new RenderPass(this.#scene, this.#camera));
        this.#bloomComposer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.5, 0.0));
        this.#finalComposer = new EffectComposer(this.#renderer);
        this.#finalComposer.addPass(new RenderPass(this.#scene, this.#camera));
        this.#finalComposer.addPass(new ShaderPass(new THREE.ShaderMaterial({
            uniforms: {baseTexture: {value: null}, bloomTexture: {value: this.#bloomComposer.renderTarget2.texture}},
            vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
            fragmentShader: "uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv; void main() { vec4 base = texture2D(baseTexture, vUv); gl_FragColor = vec4(base.rgb + texture2D(bloomTexture, vUv).rgb, base.a); }",
        }), "baseTexture"));
        this.#finalComposer.addPass(new OutputPass());

        this.#resizeObserver = new ResizeObserver(this.#resize);
        this.#resizeObserver.observe(container);
        this.#resize();
    }

    /** Replaces the scene contents. Resolves after the parts are built (or superseded). */
    async show(opts: ShowOptions): Promise<ShowResult> {
        const id = ++this.#buildId;
        const tints = opts.tints ?? {};
        const created: THREE.Material[] = [];
        const failed: string[] = [];
        const group = new THREE.Group();
        await Promise.all(opts.parts.map(async part => {
            try {
                group.add(await this.#buildPart(part, tints, created));
            } catch (e) {
                console.warn(`[model-viewer] ${part.path}:`, e);
                failed.push(part.path);
            }
        }));
        if (this.#disposed || id !== this.#buildId) {
            created.forEach(m => m.dispose());
            return {current: false, failed};
        }
        this.#stage.clear();
        this.#created.forEach(m => m.dispose());
        this.#created = created;
        this.#stage.add(group);
        this.#hasEmissive = false;
        this.#bloomWarmup = true;
        group.traverse(o => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            for (const m of [mesh.material].flat() as THREE.MeshStandardMaterial[]) {
                if (m.emissive && m.emissiveIntensity > 0 && m.emissive.r + m.emissive.g + m.emissive.b > 0) this.#hasEmissive = true;
            }
        });
        this.#view = {group, direction: opts.viewDirection ?? DEFAULT_VIEW};
        if (opts.frameKey !== this.#framedKey || this.#framedKey === undefined) {
            this.#framedKey = opts.frameKey ?? "";
            this.resetView();
        }
        this.#requestRender();
        return {current: true, failed};
    }

    /** Re-fits the camera to what is shown, from the direction the view started in. */
    resetView() {
        if (!this.#view) return;
        this.#frame(this.#view.group, this.#view.direction);
        this.#requestRender();
    }

    async #buildPart(part: ModelPart, tints: ModelTints, created: THREE.Material[]): Promise<THREE.Object3D> {
        const gltf = await loadModel(part.path);
        const inst = instantiate(gltf);
        if (part.position) inst.position.set(...part.position);
        if (part.rotationY) inst.rotation.y = part.rotationY;
        await applyVariant(gltf, inst, part.variant ?? 0);

        inst.traverse(o => {
            const u = unity(o);
            if ((u.lod ?? 0) > 0 || u.active === false) o.visible = false;
            else if (u.rendererEnabled === false && (o as THREE.Mesh).isMesh) {
                // A disabled renderer hides only its own mesh, never the node's children.
                if (o.children.length) o.layers.set(HIDDEN_LAYER); else o.visible = false;
            }
        });
        // Alternatives are exported as siblings with the extras above; show the chosen one.
        inst.traverse(o => {
            const a = alternativeOf(o);
            if (a) o.visible = a.index === (part.alternative ?? 0);
        });
        const hair = part.hairMesh ?? "default";
        inst.traverse(o => {
            const h = unity(o).hairMesh;
            if (h) o.visible = h === hair;
        });

        await applyRuntime(inst, tints, created);
        this.#postProcess(inst, created);
        return inst;
    }

    #postProcess(root: THREE.Object3D, created: THREE.Material[]) {
        root.traverse(o => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            const mats = [mesh.material].flat();
            // Depth-only masks (e.g. a boat's water hole) draw nothing.
            if (mats.every(m => unity(m).colorWrite === false)) {
                mesh.visible = false;
                return;
            }
            const conv = (m: THREE.Material) => {
                if (unity(m).blend === "additive") m.blending = THREE.AdditiveBlending;
                if (unity(m).zWrite === false) m.depthWrite = false;
                if (/FakePointLight/.test(unity(m).shader ?? "")) softenLightHull(m as THREE.MeshStandardMaterial);
                if (!/^FlatKit\//.test(unity(m).shader ?? "")) return m;
                const f = flatKitMaterial(m as THREE.MeshStandardMaterial, this.#sunDirView);
                created.push(f);
                return f;
            };
            mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material);
        });
    }

    // ── Camera ──

    /** Bounds of what is drawn: visible meshes only. */
    #visibleBox(obj: THREE.Object3D): THREE.Box3 {
        obj.updateWorldMatrix(true, true);
        const box = new THREE.Box3();
        const tmp = new THREE.Box3();
        obj.traverseVisible(o => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh || !mesh.layers.test(this.#camera.layers)) return;
            if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
                (mesh as THREE.SkinnedMesh).computeBoundingBox();
                tmp.copy((mesh as THREE.SkinnedMesh).boundingBox);
            } else {
                if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
                tmp.copy(mesh.geometry.boundingBox!);
            }
            box.union(tmp.applyMatrix4(mesh.matrixWorld));
        });
        return box;
    }

    #frame(obj: THREE.Object3D, dir: [number, number, number]) {
        const box = this.#visibleBox(obj);
        if (box.isEmpty()) return;
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const vHalf = THREE.MathUtils.degToRad(this.#camera.fov / 2);
        const hHalf = Math.atan(Math.tan(vHalf) * this.#camera.aspect);
        const dist = (sphere.radius / Math.sin(Math.min(vHalf, hHalf))) * 1.05;
        this.#controls.target.copy(sphere.center);
        this.#camera.position.copy(sphere.center).add(new THREE.Vector3(...dir).normalize().multiplyScalar(dist));
        this.#camera.near = dist / 1000;
        this.#camera.far = dist * 100;
        this.#camera.updateProjectionMatrix();
        this.#controls.update();
    }

    // ── Rendering ──

    #resize = () => {
        const {clientWidth: w, clientHeight: h} = this.container;
        if (!w || !h) return;
        this.#renderer.setSize(w, h, false);
        this.#bloomComposer.setSize(w, h);
        this.#finalComposer.setSize(w, h);
        this.#camera.aspect = w / h;
        this.#camera.updateProjectionMatrix();
        this.#requestRender();
    };

    #requestRender = () => {
        if (this.#frameQueued || this.#disposed) return;
        this.#frameQueued = true;
        requestAnimationFrame(() => {
            this.#frameQueued = false;
            if (!this.#disposed) this.#render();
        });
    };

    #render() {
        this.#sunDirView.value.copy(this.#sun.position).normalize().transformDirection(this.#camera.matrixWorldInverse);
        if (this.#hasEmissive) {
            this.#renderBloom();
            // The first emission pass over freshly built materials leaves the bloom target
            // saturated (whole viewport white); repeating it once gives the correct result.
            if (this.#bloomWarmup) {
                this.#bloomWarmup = false;
                this.#renderBloom();
            }
            this.#finalComposer.render();
        } else {
            this.#renderer.render(this.#scene, this.#camera);
        }
    }

    #bloomMaterial(m: THREE.MeshStandardMaterial): THREE.Material {
        if (!m?.emissive || m.emissiveIntensity <= 0 || m.emissive.r + m.emissive.g + m.emissive.b === 0) {
            // Transparent surfaces must not black out the emission behind them.
            return m?.transparent ? INVISIBLE : BLACK;
        }
        let b = this.#emissionOnly.get(m);
        if (!b) {
            b = new THREE.MeshBasicMaterial({side: m.side});
            this.#emissionOnly.set(m, b);
        }
        b.transparent = m.transparent;
        b.opacity = m.opacity;
        b.blending = m.blending;
        b.depthWrite = m.depthWrite;
        b.map = m.emissiveMap ?? null;
        b.color.copy(m.emissive).multiplyScalar(m.emissiveIntensity * BLOOM_STRENGTH);
        return b;
    }

    #renderBloom() {
        const saved: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
        this.#stage.traverse(o => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            saved.push([mesh, mesh.material]);
            mesh.material = Array.isArray(mesh.material)
                ? mesh.material.map(m => this.#bloomMaterial(m as THREE.MeshStandardMaterial))
                : this.#bloomMaterial(mesh.material as THREE.MeshStandardMaterial);
        });
        this.#bloomComposer.render();
        for (const [mesh, m] of saved) mesh.material = m;
    }

    dispose() {
        this.#disposed = true;
        this.#resizeObserver.disconnect();
        this.#controls.dispose();
        this.#created.forEach(m => m.dispose());
        this.#bloomComposer.dispose();
        this.#finalComposer.dispose();
        this.#scene.environment?.dispose();
        this.#renderer.dispose();
    }
}
