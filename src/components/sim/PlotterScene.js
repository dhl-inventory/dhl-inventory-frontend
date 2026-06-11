/**
 * PlotterScene — Three.js 3D 디지털 트윈 scene.
 *
 * 구조 (CAD 정합):
 *   - 프레임: 알루미늄 프로파일 12개 + 후면 panel
 *   - 모터 2개 (상단 코너, X gantry rail 양 끝, fixed)
 *   - X gantry beam (frame 폭 가로질러, Y 따라 상하)
 *   - Y carriage 2개 (X gantry 양 끝, 좌·우 frame rail 따라 슬라이딩)
 *   - 헤드 (X gantry beam 위, body + lens + frustum)
 *   - Z rail (헤드 측면, 카메라 in/out)
 *   - 선반 2단 (section 1=상, 2=하)
 *   - 박스 4개 × section, frame 뒤쪽 (수납 위치)
 *
 * 좌표 변환 (mm 플로터 좌표 → m three.js):
 *   x_three =  (x_mm / 1000) - W/2
 *   y_three =  (y_mm / 1000) - H/2
 *   head.z  =  HEAD_BASE_Z - (z_mm / 1000)   // Z+ = 박스에서 멀어짐
 *
 * 의존성: three ^0.169
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLOTTER_SPEC } from './spec.js';

const MM_TO_M = 1 / 1000;
const PROFILE_T = 0.02;        // 알루미늄 프로파일 단면 20mm
const SHELF_T = 0.012;         // 선반 12mm
const BOX_SIZE = 0.05;         // 박스 50mm
const BOX_Z = -0.10;           // 박스 center z (frame back -0.20 안쪽 100mm)
const HEAD_BASE_Z = 0.245;     // 헤드 Z=0 base z (frame outer +0.20 외부 +45mm — gantry가 frame 앞면 밖으로 돌출)
const GANTRY_Z = 0.225;        // X gantry beam / Y rail / Y carriage 평면 (head 보다 z- 약간)
const HEAD_BODY_W = 0.060;
const HEAD_BODY_H = 0.060;
const HEAD_BODY_D = 0.055;
const Y_CARRIAGE_W = 0.04;
const Y_CARRIAGE_H = 0.05;
const Y_CARRIAGE_D = 0.04;
const X_GANTRY_BEAM_T = 0.022;
// 카메라 lens / frustum 은 head body 의 z− 방향 (frame 안쪽 = 박스 향함).
// plotter Z+ = 박스에서 멀어짐 = scene z 양수 (frame front 쪽으로 더 빠짐).

export class PlotterScene {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.spec = PLOTTER_SPEC;
    this.W = this.spec.frame.outer_width_mm * MM_TO_M;
    this.H = this.spec.frame.outer_height_mm * MM_TO_M;
    this.D = this.spec.frame.outer_depth_mm * MM_TO_M;

    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._initControls();
    this._buildTable();              // 책상 (플로터 base 아래)
    this._buildFrame();
    this._buildMotors();
    this._buildShelves();
    this._buildBoxes();
    this._buildGantry();
    this._buildHead();
    this._buildPerson();             // 사람 (170cm capsule)
    this._buildAccessIndicators();
    this._buildAlertIndicators();

    // 헤드 애니메이션 — Lerp 보간용
    this._anim = null;

    this._resizeHandler = () => this._onResize();
    window.addEventListener('resize', this._resizeHandler);
    this._animate();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this._onResize();
    this.renderer.setClearColor(0x1a1d22);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(1.5, 2.0, 1.5);
    key.castShadow = true;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.3);
    fill.position.set(-1.5, 1.0, -1.5);
    this.scene.add(fill);
    // grid 를 바닥(책상 base 아래) 위치로
    const grid = new THREE.GridHelper(4.0, 40, 0x444444, 0x2a2a2a);
    grid.position.y = -this.H / 2 - 0.75;     // 책상 두께(0.05) + 다리 높이(0.70)
    this.scene.add(grid);
  }

  /** 책상 — 플로터 base 아래. 일반 사무용 책상 (W 1.0m × H 0.7m × D 0.6m). */
  _buildTable() {
    const tabletopMat = new THREE.MeshStandardMaterial({
      color: 0xe8e6e1, roughness: 0.6, metalness: 0.0,
    });
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x4a4d51, roughness: 0.5, metalness: 0.3,
    });

    const TT_W = 1.0, TT_H = 0.04, TT_D = 0.60;
    const LEG_H = 0.70;
    const tableTopY = -this.H / 2 - TT_H / 2;       // 플로터 base 바로 아래

    // tabletop
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(TT_W, TT_H, TT_D),
      tabletopMat,
    );
    top.position.set(0, tableTopY, 0);
    top.castShadow = true;
    top.receiveShadow = true;
    this.scene.add(top);

    // 다리 4개
    const legY = tableTopY - TT_H / 2 - LEG_H / 2;
    [
      [-TT_W / 2 + 0.05,  TT_D / 2 - 0.05],
      [ TT_W / 2 - 0.05,  TT_D / 2 - 0.05],
      [-TT_W / 2 + 0.05, -TT_D / 2 + 0.05],
      [ TT_W / 2 - 0.05, -TT_D / 2 + 0.05],
    ].forEach(([x, z]) => {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, LEG_H, 0.04),
        legMat,
      );
      leg.position.set(x, legY, z);
      leg.castShadow = true;
      this.scene.add(leg);
    });
  }

  _initCamera() {
    const rect = this.canvas.getBoundingClientRect();
    const aspect = rect.width / rect.height || 16 / 9;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.05, 50);
    // 사람 + 책상 + 플로터 모두 보이게 약간 멀리 + 살짝 위에서
    this.camera.position.set(1.2, 0.3, 2.0);
    this.camera.lookAt(0, -0.2, 0);
  }

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 4;
  }

  /** 프레임 — 알루미늄 프로파일 12개 + 후면 dark panel. */
  _buildFrame() {
    const profileMat = new THREE.MeshStandardMaterial({
      color: 0x8c96a3, metalness: 0.7, roughness: 0.35,
    });
    const make = (w, h, d) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), profileMat);
      m.castShadow = true;
      return m;
    };

    const W = this.W, H = this.H, D = this.D, t = PROFILE_T;
    const xL = -W / 2, xR = W / 2;
    const yB = -H / 2, yT = H / 2;
    const zF = D / 2,  zR = -D / 2;

    // 4 vertical corner posts
    [[xL, zF], [xR, zF], [xL, zR], [xR, zR]].forEach(([x, z]) => {
      const m = make(t, H, t);
      m.position.set(x, 0, z);
      this.scene.add(m);
    });
    // top + bottom horizontal beams (X 방향)
    [yB, yT].forEach((y) => {
      [zF, zR].forEach((z) => {
        const m = make(W + t, t, t);
        m.position.set(0, y, z);
        this.scene.add(m);
      });
    });
    // top + bottom horizontal beams (Z 방향)
    [yB, yT].forEach((y) => {
      [xL, xR].forEach((x) => {
        const m = make(t, t, D);
        m.position.set(x, y, 0);
        this.scene.add(m);
      });
    });

    // 후면 panel
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshStandardMaterial({
        color: 0x141719, roughness: 0.9, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
      }),
    );
    panel.position.set(0, 0, zR + 0.005);
    this.scene.add(panel);

    // 좌·우 Y rail (수직 봉, frame 외부 정면 쪽으로 돌출 — Y carriage 가 따라 슬라이딩)
    // CAD 정합: gantry/rail 이 frame 앞면 밖으로 빠져나옴.
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xc0c4c8, metalness: 0.85, roughness: 0.2,
    });
    const railR = 0.005;
    [xL + t / 2 + 0.012, xR - t / 2 - 0.012].forEach((x) => {
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(railR, railR, H - t * 2, 12),
        railMat,
      );
      rail.position.set(x, 0, GANTRY_Z);
      this.scene.add(rail);
    });
  }

  /** 상단 코너 모터 2개 — frame top profile 위에 올려짐 (CAD 정합). */
  _buildMotors() {
    const motorMat = new THREE.MeshStandardMaterial({
      color: 0x222629, metalness: 0.6, roughness: 0.4,
    });
    const orangeMat = new THREE.MeshStandardMaterial({
      color: 0xd86838, metalness: 0.5, roughness: 0.5,
    });
    const W = this.W;
    const yTop = this.H / 2;          // frame top profile 위쪽
    [-W / 2 + 0.04, W / 2 - 0.04].forEach((x) => {
      // 주황 corner bracket — top profile 바로 위, gantry 평면(z=GANTRY_Z)에 부착
      const mount = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.022, 0.06),
        orangeMat,
      );
      mount.position.set(x, yTop + 0.015, GANTRY_Z);
      mount.castShadow = true;
      this.scene.add(mount);

      // motor body (Nema 17, mount 위에 올려짐)
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.042, 0.042, 0.042),
        motorMat,
      );
      body.position.set(x, yTop + 0.05, GANTRY_Z);
      body.castShadow = true;
      this.scene.add(body);
    });
  }

  /** 선반 2단 — 두께 있는 나무판자. */
  _buildShelves() {
    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0xb8895a, roughness: 0.8, metalness: 0.0,
    });
    for (const sec of this.spec.sections) {
      const w = this.W - PROFILE_T * 2 - 0.005;
      const d = this.D - PROFILE_T * 2 - 0.005;
      const shelf = new THREE.Mesh(
        new THREE.BoxGeometry(w, SHELF_T, d),
        shelfMat,
      );
      shelf.position.y = (sec.y_mm * MM_TO_M) - this.H / 2 - SHELF_T / 2;
      shelf.castShadow = true;
      shelf.receiveShadow = true;
      this.scene.add(shelf);

      // 우측 마커 (section 색)
      const tag = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.04, 0.04),
        new THREE.MeshStandardMaterial({
          color: sec.color, emissive: sec.color, emissiveIntensity: 0.4,
        }),
      );
      tag.position.set(this.W / 2 - 0.03, shelf.position.y + 0.025, this.D / 2 - 0.05);
      this.scene.add(tag);
    }
  }

  /** 박스 6개 × section — frame 뒤쪽 (수납 위치). SKU별 색.
   *  v2 narrative: standard_qty=6 까지 visualize. setSectionQty(id, n) 으로
   *  n 개만 visible 토글 (4 까지는 v1 narrative, 6 까지는 v2).
   */
  _buildBoxes() {
    this.boxes = [];
    const boxGeom = new THREE.BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE);
    const N = 6;                    // 박스 슬롯 수 (max capacity)
    const SPACING = 0.062;          // 박스 간격 — 6 × 0.062 = 0.372m, shelf inner 0.385m 안.
    for (const sec of this.spec.sections) {
      const sectionBoxes = [];
      for (let i = 0; i < N; i++) {
        const mat = new THREE.MeshStandardMaterial({
          color: sec.color, roughness: 0.65, metalness: 0.05,
        });
        const box = new THREE.Mesh(boxGeom, mat);
        const x = (i - (N - 1) / 2) * SPACING;
        const y = (sec.y_mm * MM_TO_M) - this.H / 2 + BOX_SIZE / 2;
        box.position.set(x, y, BOX_Z);
        box.castShadow = true;
        box.receiveShadow = true;
        this.scene.add(box);
        sectionBoxes.push({ mesh: box, baseColor: sec.color });
      }
      this.boxes.push({ section: sec, boxes: sectionBoxes });
    }
  }

  /**
   * Gantry — X gantry beam + Y carriage 2개. 그룹 동조 Y 이동.
   * 본 group 의 y position 이 헤드 y 동조.
   */
  _buildGantry() {
    this.gantry = new THREE.Group();
    this.scene.add(this.gantry);

    const railMat = new THREE.MeshStandardMaterial({
      color: 0x9aa4b0, metalness: 0.75, roughness: 0.3,
    });
    const carriageMat = new THREE.MeshStandardMaterial({
      color: 0xc94060, metalness: 0.3, roughness: 0.4,    // 빨강 (CAD Y carriage)
    });

    // gantry beam 과 Y carriage 모두 GANTRY_Z (frame 외부 정면 쪽)

    // X gantry beam (수평, frame 폭)
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(this.W - PROFILE_T * 2, X_GANTRY_BEAM_T, X_GANTRY_BEAM_T),
      railMat,
    );
    beam.position.set(0, 0, GANTRY_Z);
    beam.castShadow = true;
    this.gantry.add(beam);

    // Y carriage 2개 (좌·우, frame Y rail에 매달림)
    [-this.W / 2 + PROFILE_T / 2 + 0.015, this.W / 2 - PROFILE_T / 2 - 0.015].forEach((x) => {
      const c = new THREE.Mesh(
        new THREE.BoxGeometry(Y_CARRIAGE_W, Y_CARRIAGE_H, Y_CARRIAGE_D),
        carriageMat,
      );
      c.position.set(x, 0, GANTRY_Z);
      c.castShadow = true;
      this.gantry.add(c);
    });
  }

  /** 헤드 — body + lens + frustum, X gantry 안에서 좌우 + Z in/out. */
  _buildHead() {
    this.head = new THREE.Group();
    this.gantry.add(this.head);

    // 본체
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2c3a52, metalness: 0.45, roughness: 0.4,
    });
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(HEAD_BODY_W, HEAD_BODY_H, HEAD_BODY_D),
      bodyMat,
    );
    body.castShadow = true;
    this.head.add(body);

    // lens barrel — head body 의 z− 방향 (frame 안쪽, 박스 향함)
    const lensBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.020, 0.04, 16),
      new THREE.MeshStandardMaterial({ color: 0x16191c, metalness: 0.8, roughness: 0.2 }),
    );
    lensBarrel.rotation.x = Math.PI / 2;
    lensBarrel.position.z = -HEAD_BODY_D / 2;
    this.head.add(lensBarrel);

    // lens glass (emissive blue) — 박스 향함
    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(0.014, 24),
      new THREE.MeshBasicMaterial({ color: 0x3aa2ff }),
    );
    glass.position.z = -HEAD_BODY_D / 2 - 0.021;
    glass.rotation.y = Math.PI;   // normal 이 z− 향하도록
    this.head.add(glass);

    // 카메라 frustum — 박스 향함 (z− 방향 apex, head body 쪽 base)
    const frustumGeom = new THREE.ConeGeometry(0.10, 0.18, 4, 1, true);
    const frustumMat = new THREE.LineBasicMaterial({
      color: 0xff9060, transparent: true, opacity: 0.55,
    });
    const frustum = new THREE.LineSegments(
      new THREE.EdgesGeometry(frustumGeom),
      frustumMat,
    );
    frustum.rotation.x = -Math.PI / 2;   // 회전 부호 반대 → apex 가 z−
    frustum.rotation.z = Math.PI / 4;
    frustum.position.z = -HEAD_BODY_D / 2 - 0.10;
    this.head.add(frustum);

    // Z rail (헤드 좌측 세로 봉, Z 축 가이드 표현)
    const zRail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.13, 10),
      new THREE.MeshStandardMaterial({ color: 0x9aa4b0, metalness: 0.85, roughness: 0.2 }),
    );
    zRail.position.set(-HEAD_BODY_W / 2 - 0.015, 0, 0);
    this.head.add(zRail);

    // 초기 위치 — section 1 (상단, y=340 + 약간 위)
    this.setHeadPosition(this.spec.sections[0].x_mm, this.spec.sections[0].y_mm, 0);
  }

  /**
   * 사람 — 키 170cm capsule + 머리 sphere + 우측 팔 (들어올리기 가능).
   * 책상 base y 부터 위로 1.70m. 좌측 frame 밖에서 시작 (invisible).
   */
  _buildPerson() {
    // 인체 비율 (170cm 정확):
    //   다리 0.85 + 다리위~어깨 0.55 + 머리 정수리 0.30 = 1.70m
    //   다리 cylinder: 0.80m
    //   torso capsule: r=0.12, h=0.36 → total 0.60m (어깨 폭 24cm)
    //   목 gap: 0.02m
    //   머리 sphere: r=0.09m → dia 0.18m
    //   총: 0.80 + 0.60 + 0.02 + 0.18 = 1.60m (시연 시 거인 보임 완화)
    const tableBaseY = -this.H / 2 - 0.04 - 0.70;  // 사람 발 y
    const LEG_H = 0.80;
    const TORSO_R = 0.12;
    const TORSO_CYL_H = 0.36;         // capsule cylinder 부분
    const TORSO_TOTAL = TORSO_CYL_H + 2 * TORSO_R;  // 0.60
    const NECK_GAP = 0.02;
    const HEAD_R = 0.09;
    // 키 = 0.80 + 0.60 + 0.02 + 0.18 = 1.60m  ✓

    this.person = new THREE.Group();
    this.person.visible = false;

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf2c9a8, roughness: 0.7 });
    const clothMat = new THREE.MeshStandardMaterial({ color: 0xf0f0ec, roughness: 0.8 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.7 });

    // 다리 (pants — 두 cylinder)
    const legGeom = new THREE.CylinderGeometry(0.055, 0.055, LEG_H, 12);
    const legCenterY = tableBaseY + LEG_H / 2;
    [-0.06, 0.06].forEach((dx) => {
      const leg = new THREE.Mesh(legGeom, pantsMat);
      leg.position.set(dx, legCenterY, 0);
      leg.castShadow = true;
      this.person.add(leg);
    });

    // 몸통 capsule
    const torsoY = tableBaseY + LEG_H + TORSO_TOTAL / 2;
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(TORSO_R, TORSO_CYL_H, 6, 12),
      clothMat,
    );
    torso.position.set(0, torsoY, 0);
    torso.castShadow = true;
    this.person.add(torso);

    // 머리
    const headY = tableBaseY + LEG_H + TORSO_TOTAL + NECK_GAP + HEAD_R;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(HEAD_R, 20, 16),
      skinMat,
    );
    head.position.set(0, headY, 0);
    head.castShadow = true;
    this.person.add(head);

    // 어깨 y (torso top)
    const shoulderY = tableBaseY + LEG_H + TORSO_TOTAL;
    // 왼팔 (down — 옆에 붙어있음)
    const armGeom = new THREE.CylinderGeometry(0.035, 0.035, 0.55, 10);
    const armL = new THREE.Mesh(armGeom, clothMat);
    armL.position.set(-(TORSO_R + 0.035), shoulderY - 0.275, 0);
    armL.castShadow = true;
    this.person.add(armL);

    // 오른팔 (들어올리기 가능 — pivot 어깨)
    this.armRPivot = new THREE.Group();
    this.armRPivot.position.set(TORSO_R + 0.035, shoulderY, 0);
    const armR = new THREE.Mesh(armGeom, clothMat);
    armR.position.set(0, -0.275, 0);
    armR.castShadow = true;
    this.armRPivot.add(armR);
    this.person.add(this.armRPivot);

    // 사람 발 y 메모 (held box 등 외부 API 에서 참조)
    this._personFootY = tableBaseY;
    this._personShoulderY = shoulderY;

    // 초기 위치 — 좌측 frame 밖
    this.person.position.set(-0.85, 0, 0.35);
    this.scene.add(this.person);
  }

  /** 사람 접근 indicator — section 좌측 빨간 sphere (초기 invisible). */
  _buildAccessIndicators() {
    this.accessIndicators = {};
    for (const sec of this.spec.sections) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 16, 12),
        new THREE.MeshStandardMaterial({
          color: 0xff3a3a, emissive: 0xaa0000, emissiveIntensity: 0.6,
        }),
      );
      m.position.set(-this.W / 2 - 0.08, (sec.y_mm * MM_TO_M) - this.H / 2 + 0.05, 0.05);
      m.visible = false;
      this.scene.add(m);
      this.accessIndicators[sec.id] = m;
    }
  }

  /** 알림 indicator — section 우측 노란 ! 아이콘(상자). */
  _buildAlertIndicators() {
    this.alertIndicators = {};
    for (const sec of this.spec.sections) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.015, 0.04, 0.015),
        new THREE.MeshStandardMaterial({ color: 0xffc636, emissive: 0xaa7700, emissiveIntensity: 0.5 }),
      );
      const dot = new THREE.Mesh(
        new THREE.BoxGeometry(0.015, 0.012, 0.015),
        new THREE.MeshStandardMaterial({ color: 0xffc636, emissive: 0xaa7700, emissiveIntensity: 0.5 }),
      );
      dot.position.y = -0.035;
      g.add(body); g.add(dot);
      g.position.set(this.W / 2 + 0.06, (sec.y_mm * MM_TO_M) - this.H / 2 + 0.10, 0.05);
      g.visible = false;
      this.scene.add(g);
      this.alertIndicators[sec.id] = g;
    }
  }

  // ===== 외부 API =====

  setHeadPosition(x_mm, y_mm, z_mm) {
    if (this.gantry) {
      this.gantry.position.y = (y_mm * MM_TO_M) - this.H / 2;
    }
    if (this.head) {
      this.head.position.x = (x_mm * MM_TO_M) - this.W / 2;
      // Z=0 = 박스에 가장 가까움 = HEAD_BASE_Z (frame 정면 안쪽).
      // Z+ = 박스에서 멀어짐 = scene z 양수 (frame front 쪽으로 더 빠짐).
      this.head.position.z = HEAD_BASE_Z + (z_mm * MM_TO_M);
    }
  }

  setSectionQty(section_id, count) {
    const entry = this.boxes.find(b => b.section.id === section_id);
    if (!entry) return;
    entry.boxes.forEach((b, i) => { b.mesh.visible = i < count; });
  }

  setSectionBoxExpired(section_id, box_index, expired = true) {
    // backwards compat — setBoxState 으로 일반화. expired=true → 'critical'.
    this.setBoxState(section_id, box_index, expired ? 'critical' : 'normal');
  }

  /**
   * 박스 인식 상태 (Hybrid 디지털 트윈 — 색상 = vision scan 인식 결과).
   *
   * state:
   *   - 'unknown'  회색  — vision 미인식 (보충 직후, scan 전)
   *   - 'normal'   기본  — scan 됨 + 정상 (section baseColor)
   *   - 'warning'  노랑  — scan 됨 + watch/warning (5/6 같이 약한 부족)
   *   - 'critical' 빨강  — scan 됨 + expiry critical / out_of_stock 등 강한 alert
   *
   * 박스 *위치* 는 setSectionQty 가 결정 (physical layer).
   * 박스 *색* 은 본 메서드가 결정 (logical layer, vision/BE 인식 결과).
   */
  setBoxState(section_id, box_index, state = 'normal') {
    const entry = this.boxes.find(b => b.section.id === section_id);
    if (!entry || !entry.boxes[box_index]) return;
    const b = entry.boxes[box_index];

    const STATES = {
      unknown:  { color: 0x888888, emissive: 0x000000 },
      normal:   { color: b.baseColor, emissive: 0x000000 },
      warning:  { color: 0xffaa00, emissive: 0x221100 },
      critical: { color: 0xff3030, emissive: 0x441010 },
    };
    const cfg = STATES[state] || STATES.normal;
    b.mesh.material.color.setHex(cfg.color);
    b.mesh.material.emissive = new THREE.Color(cfg.emissive);
    b.state = state;
  }

  /** 사람 접근 표시 ON/OFF (section 좌측 빨간 sphere). */
  setAccessIndicator(section_id, visible) {
    const m = this.accessIndicators?.[section_id];
    if (m) m.visible = !!visible;
  }

  /** 알림 표시 ON/OFF (section 우측 ! 아이콘). */
  setAlertIndicator(section_id, visible) {
    const g = this.alertIndicators?.[section_id];
    if (g) g.visible = !!visible;
  }

  /** Snap 강조 — 카메라 frustum 색을 잠시 emissive 로. */
  flashSnap(durationMs = 600) {
    const frustum = this.head?.children?.find(c =>
      c.material?.isLineBasicMaterial && c.material?.color
    );
    if (!frustum) return;
    const prev = frustum.material.color.getHex();
    frustum.material.color.setHex(0xffffff);
    frustum.material.opacity = 1.0;
    setTimeout(() => {
      frustum.material.color.setHex(prev);
      frustum.material.opacity = 0.55;
    }, durationMs);
  }

  /**
   * 헤드를 (x_mm, y_mm, z_mm) 까지 Lerp 보간 이동. Promise 반환.
   * 진행 중 _animate 가 ease 적용.
   */
  animateHeadTo(x_mm, y_mm, z_mm, durationMs = 1500) {
    return new Promise((resolve) => {
      const startX = this.gantry ? (this.gantry.position.x ?? 0) : 0;
      // head x 는 group 안 local. gantry 는 y 만 변하므로 현재 head.x 그대로.
      const fromX = this.head ? this.head.position.x : 0;
      const fromY = this.gantry ? this.gantry.position.y : 0;
      const fromZ = this.head ? this.head.position.z : HEAD_BASE_Z;
      const toX = (x_mm * MM_TO_M) - this.W / 2;
      const toY = (y_mm * MM_TO_M) - this.H / 2;
      const toZ = HEAD_BASE_Z + (z_mm * MM_TO_M);
      const startT = performance.now();

      this._anim = (now) => {
        const t = Math.min(1, (now - startT) / durationMs);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;  // easeInOutQuad
        if (this.head) this.head.position.x = fromX + (toX - fromX) * e;
        if (this.gantry) this.gantry.position.y = fromY + (toY - fromY) * e;
        if (this.head) this.head.position.z = fromZ + (toZ - fromZ) * e;
        if (t >= 1) {
          this._anim = null;
          resolve();
        }
      };
    });
  }

  resetAllIndicators() {
    for (const id of Object.keys(this.accessIndicators || {})) this.accessIndicators[id].visible = false;
    for (const id of Object.keys(this.alertIndicators || {})) this.alertIndicators[id].visible = false;
  }

  // ===== 사람 API =====

  setPersonVisible(visible) {
    if (this.person) this.person.visible = !!visible;
  }

  setPersonPosition(x_world, z_world) {
    if (this.person) this.person.position.set(x_world, 0, z_world);
  }

  /** 사람을 (x_world, z_world) 까지 Lerp 이동. Promise. */
  animatePersonTo(x_world, z_world, durationMs = 1500) {
    return new Promise((resolve) => {
      if (!this.person) return resolve();
      const fromX = this.person.position.x;
      const fromZ = this.person.position.z;
      const startT = performance.now();
      this._personAnim = (now) => {
        const t = Math.min(1, (now - startT) / durationMs);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        this.person.position.x = fromX + (x_world - fromX) * e;
        this.person.position.z = fromZ + (z_world - fromZ) * e;
        if (t >= 1) {
          this._personAnim = null;
          resolve();
        }
      };
    });
  }

  /** 오른팔 들기 (0=down, 1=fully raised forward into shelf, -z 방향). */
  setHandRaise(amount) {
    if (this.armRPivot) {
      // 0 → rotation 0 (아래)
      // 1 → rotation +Math.PI/2 (앞으로, 선반 안쪽 -z 방향)
      // x-rotation 양수 → arm vector (0,-y,0) → (0,0,-y) → -z 방향(선반 안)
      this.armRPivot.rotation.x = +Math.PI / 2 * Math.max(0, Math.min(1, amount));
    }
  }

  /** 박스 든 채 보이게 — 사람 오른손 위치에 작은 box mesh. (간이) */
  setPersonHoldingBox(visible, color = 0xc4a070) {
    if (!this.person) return;
    if (visible && !this._heldBox) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.07, 0.07),
        new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
      );
      // 오른팔 손 위치 (어깨 y - 팔길이 * 0.7)
      const handY = (this._personShoulderY ?? 0) - 0.55 * 0.7;
      m.position.set(0.18, handY, 0.18);
      this.person.add(m);
      this._heldBox = m;
    } else if (!visible && this._heldBox) {
      this.person.remove(this._heldBox);
      this._heldBox.geometry.dispose();
      this._heldBox.material.dispose();
      this._heldBox = null;
    }
  }

  _onResize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.renderer.setSize(rect.width, rect.height, false);
    if (this.camera) {
      this.camera.aspect = rect.width / rect.height;
      this.camera.updateProjectionMatrix();
    }
  }

  _animate() {
    this._rafId = requestAnimationFrame(() => this._animate());
    const now = performance.now();
    if (this._anim) this._anim(now);
    if (this._personAnim) this._personAnim(now);
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    cancelAnimationFrame(this._rafId);
    window.removeEventListener('resize', this._resizeHandler);
    this.controls?.dispose();
    this.renderer?.dispose();
    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}
