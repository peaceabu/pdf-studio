export type DocMeta = {
  id: string;
  name: string;
  /** current version number (file vN.pdf) */
  version: number;
  /** oldest version still on disk (undo limit) */
  minVersion: number;
  createdAt: number;
  updatedAt: number;
  size: number;
  pageCount: number;
};

export type Route =
  | { name: 'home' }
  | { name: 'viewer'; id: string }
  | { name: 'edit'; id: string; page: number }
  | { name: 'pages'; id: string };

export type Nav = {
  push: (r: Route) => void;
  replace: (r: Route) => void;
  back: () => void;
};

export type Pt = { x: number; y: number };

/** All coordinates are in "page display units": PDF points, origin top-left of the page as shown on screen. */
export type Annotation =
  | { kind: 'ink'; points: Pt[]; color: string; width: number }
  | { kind: 'highlight'; x: number; y: number; w: number; h: number; color: string }
  | { kind: 'whiteout'; x: number; y: number; w: number; h: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; color: string; width: number }
  | { kind: 'text'; x: number; y: number; text: string; size: number; color: string }
  | { kind: 'image'; x: number; y: number; w: number; h: number; uri: string; mime: 'png' | 'jpg' };
