/**
 * BlazePose / MediaPipe PoseLandmarker 的 33 个关键点。
 * 索引是模型固定的，游戏逻辑只认这些常量，不写魔法数字。
 */
export const LM = {
  nose: 0,
  leftEyeInner: 1, leftEye: 2, leftEyeOuter: 3,
  rightEyeInner: 4, rightEye: 5, rightEyeOuter: 6,
  leftEar: 7, rightEar: 8,
  mouthLeft: 9, mouthRight: 10,
  leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16,
  leftPinky: 17, rightPinky: 18,
  leftIndex: 19, rightIndex: 20,
  leftThumb: 21, rightThumb: 22,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28,
  leftHeel: 29, rightHeel: 30,
  leftFoot: 31, rightFoot: 32,
} as const;

export interface Point {
  x: number;                 // 归一化 0..1（相对画面宽）
  y: number;                 // 归一化 0..1（相对画面高）
  z?: number;
  visibility?: number;       // 0..1，低于 0.5 通常认为被遮挡
}

/** 画骨架用的连线 */
export const POSE_EDGES: Array<[number, number]> = [
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftShoulder, LM.leftHip], [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.rightHip],
  [LM.leftShoulder, LM.leftElbow], [LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow], [LM.rightElbow, LM.rightWrist],
  [LM.leftHip, LM.leftKnee], [LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee], [LM.rightKnee, LM.rightAnkle],
  [LM.leftAnkle, LM.leftFoot], [LM.rightAnkle, LM.rightFoot],
  [LM.nose, LM.leftEye], [LM.nose, LM.rightEye],
  [LM.leftEye, LM.leftEar], [LM.rightEye, LM.rightEar],
];

export const visible = (p?: Point): boolean => !!p && (p.visibility ?? 1) >= 0.5;

/** 躯干长度，用来把所有位移「归一化」——大人小孩、站远站近才有可比性 */
export function torsoSize(pts: Point[]): number {
  const ls = pts[LM.leftShoulder], rs = pts[LM.rightShoulder];
  const lh = pts[LM.leftHip], rh = pts[LM.rightHip];
  if (!ls || !rs || !lh || !rh) return 0.25;
  const shoulder = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  const cx = (ls.x + rs.x) / 2, cy = (ls.y + rs.y) / 2;
  const hx = (lh.x + rh.x) / 2, hy = (lh.y + rh.y) / 2;
  return Math.max(0.08, (shoulder + Math.hypot(cx - hx, cy - hy)) / 2);
}

/** 自拍镜像：屏幕上左右手要和玩家自己的左右一致，否则「往左挥」会反 */
export function mirrored(pts: Point[]): Point[] {
  return pts.map((p) => ({ ...p, x: 1 - p.x }));
}

export function centre(pts: Point[]): { x: number; y: number } {
  const ls = pts[LM.leftShoulder], rs = pts[LM.rightShoulder];
  if (!ls || !rs) return { x: 0.5, y: 0.5 };
  return { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
}
