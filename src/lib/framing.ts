/**
 * 环境自检：光照 + 站位。
 *
 * 这块是原站做得很聪明的地方（framing-BL2GxjRQ.js）：
 * 「识别不准」不一定该调模型，很多时候是逆光、太暗、站太近、
 * 或者脚没进画面。它把画面灰度统计 + 关键点几何变成一句人话提示，
 * 让用户自己修环境，而不是让算法硬扛。
 */
import { LM, visible, type Point } from './landmarks';

export type LightingIssue = 'black' | 'backlit' | 'dark' | 'bright' | null;

export interface Lighting {
  luma: number;
  contrast: number;
  centre: number;
  edge: number;
  issue: LightingIssue;
  text: string;
}

/** 传缩略图的 ImageData（例如 64×36），别每帧扫 1280×720 */
export function analyseLighting(img: ImageData): Lighting {
  const { data, width: w, height: h } = img;
  let sum = 0, sumSq = 0, centreSum = 0, centreN = 0, edgeSum = 0, edgeN = 0;
  const total = w * h;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += l; sumSq += l * l;
      const inCentre = x >= w / 3 && x < (2 * w) / 3 && y >= h / 4 && y < (3 * h) / 4;
      const atEdge = x < w / 8 || x >= (7 * w) / 8 || y < h / 6;
      if (inCentre) { centreSum += l; centreN += 1; }
      if (atEdge) { edgeSum += l; edgeN += 1; }
    }
  }
  const luma = total ? sum / total : 0;
  const contrast = total ? Math.sqrt(Math.max(0, sumSq / total - luma * luma)) : 0;
  const centre = centreN ? centreSum / centreN : luma;
  const edge = edgeN ? edgeSum / edgeN : luma;

  let issue: LightingIssue = null;
  let text = '';
  if (luma < 14 && contrast < 8) { issue = 'black'; text = '画面是黑的：看看镜头盖或隐私挡板'; }
  else if (edge > 150 && edge - centre > 60) { issue = 'backlit'; text = '背后太亮（逆光）：别背对窗户，拉上窗帘'; }
  else if (luma < 55) { issue = 'dark'; text = '房间有点暗：开灯会认得更准'; }
  else if (luma > 215 && contrast < 30) { issue = 'bright'; text = '画面太亮：别让摄像头对着灯'; }
  return { luma, contrast, centre, edge, issue, text };
}

export type FramingIssue =
  | 'none' | 'nobody' | 'partial' | 'head' | 'close' | 'legs' | 'far' | 'left' | 'right';

const TIPS: Record<FramingIssue, string> = {
  none: '站得真好，可以开始！',
  nobody: '站到摄像头前面来',
  partial: '让摄像头看到你的身体',
  head: '往后退一点，让头进到画面里',
  close: '往后退一步',
  legs: '再往后退一点，让摄像头看到脚',
  far: '往前走一点',
  left: '往右边走一点',
  right: '往左边走一点',
};

export interface FramingResult { ok: boolean; issue: FramingIssue; text: string }

const inside = (p?: Point) => !!p && visible(p) && p.x > -0.02 && p.x < 1.02 && p.y > -0.02 && p.y < 1.02;
const inFrame = (p?: Point) => !!p && visible(p) && p.x > 0.008 && p.x < 0.992 && p.y > 0.012 && p.y < 0.985;

/** pts 用镜像后的坐标；near=true 表示手类游戏，允许站近一点 */
export function checkFraming(pts: Point[], opts: { near?: boolean; needLegs?: boolean } = {}): FramingResult {
  const res = (issue: FramingIssue): FramingResult => ({ ok: issue === 'none', issue, text: TIPS[issue] });
  if (pts.length < 33) return res('nobody');

  const ls = pts[LM.leftShoulder], rs = pts[LM.rightShoulder];
  const lh = pts[LM.leftHip], rh = pts[LM.rightHip];
  if (!inside(ls) || !inside(rs)) return res('partial');

  const cx = ((ls.x + rs.x) / 2 + (lh && rh ? (lh.x + rh.x) / 2 : (ls.x + rs.x) / 2)) / 2;
  const shoulderSpan = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  const torsoSpan = lh && rh
    ? Math.hypot((ls.x + rs.x) / 2 - (lh.x + rh.x) / 2, (ls.y + rs.y) / 2 - (lh.y + rh.y) / 2)
    : shoulderSpan * 1.25;
  const body = Math.max(torsoSpan, shoulderSpan * 1.25);

  if (opts.near) {
    if (body > 0.62 || shoulderSpan > 0.62) return res('close');
    if (body > 0 && body < 0.15) return res('far');
  } else {
    if (!lh || !rh || body > 0.44) return res('close');
    if (opts.needLegs && !(inFrame(pts[LM.leftAnkle]) && inFrame(pts[LM.rightAnkle]))) return res('legs');
    if (body < 0.09) return res('far');
  }

  if (pts[LM.nose] && pts[LM.nose].y < 0.06) return res('head');
  if (cx < 0.3) return res('left');
  if (cx > 0.7) return res('right');
  return res('none');
}
