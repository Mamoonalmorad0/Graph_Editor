import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import Toolbar from "./components/Toolbar";
import Modal from "./components/Modal";
import Banner from "./components/Banner";

export default function App() {
  const [nodeDump, setNodeDump] = useState([]);
  const containerRef = useRef(null);
  const apiRef = useRef({});
  const gRef = useRef(null);
  const svgRef = useRef(null);
  const simRef = useRef(null);
  const nodesRef = useRef([]);
  const linksRef = useRef([]);
  const zoomBehaviorRef = useRef(null);
  const panEnabledRef = useRef(false);
  const [panEnabled, setPanEnabled] = useState(false);
  const [gridEnabled, setGridEnabled] = useState(false);
  const gridEnabledRef = useRef(false);
  const [gridSize, setGridSize] = useState(40);
  const gridSizeRef = useRef(40);
  const gridLayerRef = useRef(null);
  const gridRectRef = useRef(null);
  const defsRef = useRef(null);
  const nextIdRef = useRef(1);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const versionsRef = useRef([]);
  const versionIdRef = useRef(1);
  const STORAGE_KEY = "graph_saved_versions_v1";
  const savedVersionsRef = useRef([]);
  const savedNextIdRef = useRef(1);
  const statusRef = useRef(null);
  const pathRef = useRef({ nodes: new Set(), edges: new Set(), distance: 0 });
  const layoutModeRef = useRef("force");
  const [showDegree, setShowDegree] = useState(false);
  const showDegreeRef = useRef(false);
  const expandStateRef = useRef({ active: false, center: null, nodes: new Set(), edges: new Set() });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selection, setSelection] = useState(null);
  const selectionRef = useRef(null);
  const [uiTick, setUiTick] = useState(0);
  const [nodeDraft, setNodeDraft] = useState(null);
  const [filter, setFilter] = useState("");
  const filterRef = useRef("");
  const jsonInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const graphmlInputRef = useRef(null);
  const [dark, setDark] = useState(false);
  const [notice, setNotice] = useState(null);
  const [modal, setModal] = useState({ open: false });
  const NODE_R = 12;
  const NODE_R_EXPANDED = 14;
  const LABEL_FONT = 12;
  const DEGREE_FONT = 10;
  const EDGE_MIN = 1.25;
  const EDGE_MAX = 4.5;
  const ARROW_SIZE = 9;
  const ARROW_REF_X = NODE_R + 9;

  const flash = (type, msg, title) => setNotice({ type, msg, title });
  const closeBanner = () => setNotice(null);
  const openModal = (cfg) => setModal({ open: true, ...cfg });
  const closeModal = () => setModal({ open: false });

  const undirKey = (a, b) => {
    const A = String(a), B = String(b);
    return A.localeCompare(B) <= 0 ? `${A}|${B}` : `${B}|${A}`;
  };
  const idEq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const getId = v => (typeof v === "object" ? v?.id : v);
  const findNode = (id) => nodesRef.current.find(n => idEq(n.id, id));
  const findLink = (a, b) => {
    const s = String(a), t = String(b);
    return linksRef.current.find(l => {
      const sid = String(getId(l.source));
      const tid = String(getId(l.target));
      return (idEq(sid, s) && idEq(tid, t)) || (idEq(sid, t) && idEq(tid, s));
    });
  };

  const findNodeByIdOrLabel = (val) => {
    const raw = String(val ?? "").trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    return nodesRef.current.find(
      (n) => idEq(n.id, raw) || String(n.label ?? "").toLowerCase() === lower
    );
  };

  const resolveIdFromIdOrLabel = (val) => {
    const n = findNodeByIdOrLabel(val);
    return n ? n.id : String(val ?? "");
  };

  const norm = (s) => String(s ?? "").toLowerCase();

  const nodeMatches = (n) => {
    const f = norm(filterRef.current.trim());
    if (!f) return true;
    return norm(n.id).includes(f) || norm(n.label).includes(f) || norm(n.role).includes(f);
  };

  const visibleGraph = () => {
    const nodes = nodesRef.current.filter(nodeMatches);
    const visibleIds = new Set(nodes.map(n => String(n.id)));
    const links = linksRef.current.filter(l => {
      const sid = String(getId(l.source));
      const tid = String(getId(l.target));
      return visibleIds.has(sid) && visibleIds.has(tid);
    });
    return { nodes, links, visibleIds };
  };

  const setFilterLive = (val) => {
    filterRef.current = val;
    setFilter(val);
    const { visibleIds } = visibleGraph();
    const sel = selectionRef.current;
    if (sel?.type === "node" && !visibleIds.has(sel.id)) clearSelection();
    if (sel?.type === "edge" && !(visibleIds.has(sel.source) && visibleIds.has(sel.target))) clearSelection();
    apiRef.current.refreshGraph();
  };

  const getSize = () => {
    const el = containerRef.current;
    const w = el?.clientWidth || window.innerWidth;
    const h = el?.clientHeight || window.innerHeight;
    return { w, h, innerW: Math.max(1, w - 40), innerH: Math.max(1, h - 40) };
  };

  const computePageRank = (iterations = 20, damping = 0.85) => {
    const nodes = nodesRef.current;
    const n = nodes.length;
    if (n === 0) return new Map();

    const idToIdx = new Map(nodes.map((node, i) => [String(node.id), i]));
    const pr = new Array(n).fill(1 / n);
    const outgoing = new Array(n).fill(0);

    linksRef.current.forEach(l => {
      const sid = String(getId(l.source));
      const sidx = idToIdx.get(sid);
      if (sidx !== undefined) outgoing[sidx]++;
    });

    for (let iter = 0; iter < iterations; iter++) {
      const newPr = new Array(n).fill((1 - damping) / n);
      linksRef.current.forEach(l => {
        const sid = String(getId(l.source));
        const tid = String(getId(l.target));
        const sidx = idToIdx.get(sid);
        const tidx = idToIdx.get(tid);
        if (sidx !== undefined && tidx !== undefined && outgoing[sidx] > 0) {
          newPr[tidx] += damping * (pr[sidx] / outgoing[sidx]);
        }
      });
      for (let i = 0; i < n; i++) pr[i] = newPr[i];
    }

    const result = new Map();
    nodes.forEach((node, i) => {
      result.set(String(node.id), pr[i]);
    });
    return result;
  };

  const openPanelFor = (sel) => {
    selectionRef.current = sel;
    setSelection(sel);
    if (sel?.type === "node") {
      const n = findNode(sel.id);
      setNodeDraft(n ? { id: n.id, label: n.label ?? "", role: n.role ?? "" } : null);
    } else setNodeDraft(null);
    setSidebarOpen(true);
    setUiTick(t => t + 1);
    if (gRef.current) updateSelectionStyles();
  };
  const clearSelection = () => {
    selectionRef.current = null;
    setSelection(null);
    setNodeDraft(null);
    setSidebarOpen(false);
    if (gRef.current) updateSelectionStyles();
  };

  const commitNodeDraft = () => {
    if (!selectionRef.current || selectionRef.current.type !== "node" || !nodeDraft) return;
    const oldId = selectionRef.current.id;
    const newId = String(nodeDraft.id ?? "").trim();
    if (!newId) { flash("error", "ID cannot be empty."); return; }
    if (nodesRef.current.some(n => !idEq(n.id, oldId) && idEq(n.id, newId))) {
      flash("error", `ID "${newId}" already exists.`);
      return;
    }
    undoStackRef.current.push(snapshot());
    redoStackRef.current = [];
    const node = findNode(oldId);
    if (!node) return;

    node.label = String(nodeDraft.label ?? "");
    node.role = String(nodeDraft.role ?? "");

    if (!idEq(oldId, newId)) {
      node.id = newId;
      nodesRef.current.forEach(n => {
        n.sources = (n.sources ?? []).map(x => idEq(x, oldId) ? newId : x);
        n.targets = (n.targets ?? []).map(x => idEq(x, oldId) ? newId : x);
      });
      linksRef.current.forEach(l => {
        const sid = getId(l.source);
        const tid = getId(l.target);
        if (idEq(sid, oldId)) l.source = newId;
        if (idEq(tid, oldId)) l.target = newId;
      });
      selectionRef.current = { type: "node", id: newId };
      setSelection(selectionRef.current);
    }

    setNodeDraft({ id: node.id, label: node.label, role: node.role ?? "" });
    apiRef.current.refreshGraph();
    apiRef.current.listNodes();
    setUiTick(t => t + 1);
    flash("success", "Node updated.");
  };

  const requestFilename = (def, ext, cb) => {
    openModal({
      title: "Filename",
      fields: [{ name: "name", label: "File name", defaultValue: def, placeholder: `e.g. ${def}` }],
      confirmText: "Save",
      onSubmit: (vals) => {
        let n = String(vals.name || "").trim();
        if (!n) { flash("error", "Filename cannot be empty."); return; }
        if (!n.toLowerCase().endsWith(ext)) n += ext;
        closeModal();
        cb(n);
      },
      onClose: closeModal
    });
  };

  const save = (text, name, mime) => {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flash("success", `Saved ${name}`);
  };
  const payload = () => ({
    nodes: nodesRef.current.map(n => ({
      id: n.id, label: n.label, role: n.role ?? "", targets: n.targets ?? [], sources: n.sources ?? [],
    })),
  });
  const q = s => {
    const x = String(s ?? "");
    return /[",\n\r;]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
  };
  const csvFromNodes = nodes => {
    const head = "id,label,role,targets,sources";
    const rows = nodes.map(n =>
      [q(n.id), q(n.label ?? ""), q(n.role ?? ""), q(JSON.stringify(n.targets ?? [])), q(JSON.stringify(n.sources ?? []))].join(",")
    );
    return [head, ...rows].join("\n");
  };

  const expJSON = () => requestFilename("graph", ".json", (name) =>
    save(JSON.stringify(payload(), null, 2), name, "application/json")
  );
  const expCSV = () => requestFilename("graph", ".csv", (name) =>
    save(csvFromNodes(payload().nodes), name, "text/csv;charset=utf-8")
  );
  const xmlEscape = (s) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  const expGraphML = () => requestFilename("graph", ".graphml", (name) => {
    const nodes = [...nodesRef.current].sort((a, b) =>
      String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
    );
    const lines = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<graphml xmlns="http://graphml.graphdrawing.org/xmlns">`,
      `  <key id="d_label"   for="node" attr.name="label"   attr.type="string"/>`,
      `  <key id="d_role"    for="node" attr.name="role"    attr.type="string"/>`,
      `  <key id="d_targets" for="node" attr.name="targets" attr.type="string"/>`,
      `  <key id="d_sources" for="node" attr.name="sources" attr.type="string"/>`,
      `  <graph id="G" edgedefault="directed">`,
    ];
    for (const n of nodes) {
      const id = xmlEscape(n.id);
      const label = xmlEscape(n.label ?? "");
      const role = xmlEscape(n.role ?? "");
      const targets = (n.targets ?? []).filter(Boolean).map(String);
      const sources = (n.sources ?? []).filter(Boolean).map(String);
      lines.push(`    <node id="${id}">`);
      lines.push(`      <data key="d_label">${label}</data>`);
      if (role) lines.push(`      <data key="d_role">${role}</data>`);
      if (targets.length) lines.push(`      <data key="d_targets">${xmlEscape(targets.join(","))}</data>`);
      if (sources.length) lines.push(`      <data key="d_sources">${xmlEscape(sources.join(","))}</data>`);
      lines.push(`    </node>`);
    }
    lines.push(`  </graph>`, `</graphml>`);
    save(lines.join("\n") + "\n", name, "application/xml;charset=utf-8");
  });

  const expPNG = (opts = {}) => {
    requestFilename("graph", ".png", async (name) => {
      const { innerW, innerH } = getSize();
      const scale = Number.isFinite(opts.scale) ? Math.max(1, opts.scale) : 2;
      const w = Math.max(1, innerW);
      const h = Math.max(1, innerH);
      const svgNode = svgRef.current?.node?.() || svgRef.current?._groups?.[0]?.[0];
      if (!svgNode) { flash("error", "SVG not ready."); return; }

      const prevW = svgNode.getAttribute("width");
      const prevH = svgNode.getAttribute("height");
      const prevBG = svgNode.style.background;

      svgNode.setAttribute("width", String(w));
      svgNode.setAttribute("height", String(h));
      if (!svgNode.getAttribute("xmlns")) svgNode.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      if (!svgNode.getAttribute("xmlns:xlink")) svgNode.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
      svgNode.style.background = "#ffffff";

      try {
        const clone = svgNode.cloneNode(true);
        clone.style.background = "#ffffff";
        const svgStr = new XMLSerializer().serializeToString(clone);
        const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = (e) => reject(e);
          img.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(w * scale);
        canvas.height = Math.floor(h * scale);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => {
          if (!blob) { flash("error", "Could not create PNG."); return; }
          const url2 = URL.createObjectURL(blob);
          const a = Object.assign(document.createElement("a"), { href: url2, download: name });
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url2);
          flash("success", `Exported ${name}`);
        }, "image/png");
      } catch (e) {
        console.error(e);
        flash("error", "PNG export failed: " + (e?.message || e));
      } finally {
        if (prevW) svgNode.setAttribute("width", prevW); else svgNode.removeAttribute("width");
        if (prevH) svgNode.setAttribute("height", prevH); else svgNode.removeAttribute("height");
        svgNode.style.background = prevBG || "";
      }
    });
  };

  const importJSONFromFile = (file) => {
    if (!file) return;
    const extOK = /\.json$/i.test(file.name) || (file.type || "").includes("json");
    if (!extOK) { flash("error", "Please select a .json file."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        if (!parsed || !Array.isArray(parsed.nodes)) {
          flash("error", "Invalid JSON: expected { nodes: [...] }"); return;
        }
        undoStackRef.current.push(snapshot());
        redoStackRef.current = [];
        const imported = parsed.nodes.map(n => ({
          id: String(n.id), label: String(n.label ?? ""), role: String(n.role ?? ""),
          targets: Array.isArray(n.targets) ? n.targets.map(String) : [], sources: [],
        }));
        const byId = new Map(imported.map(n => [n.id, n]));
        const edges = [];
        for (const n of byId.values()) {
          n.targets = n.targets.filter(t => byId.has(t));
          for (const t of n.targets) {
            edges.push({ source: n.id, target: t, weight: 1 });
            const tn = byId.get(t);
            if (!tn.sources.includes(n.id)) tn.sources.push(n.id);
          }
        }
        nodesRef.current = Array.from(byId.values());
        linksRef.current = edges;
        clearSelection();
        initializePositions();
        while (nodesRef.current.some(n => String(n.id) === `new${nextIdRef.current}`)) nextIdRef.current += 1;
        layoutModeRef.current = "force";
        if (simRef.current) {
          simRef.current.nodes(nodesRef.current);
          simRef.current.force("link").id(d => d.id).links(linksRef.current);
          simRef.current.alpha(1).restart();
        }
        apiRef.current.refreshGraph();
        apiRef.current.listNodes();
        flash("success", `Imported ${nodesRef.current.length} nodes and ${linksRef.current.length} edges from JSON.`);
      } catch (e) {
        console.error(e);
        flash("error", "Failed to import JSON: " + (e?.message || e));
      }
    };
    reader.readAsText(file);
  };

  const detectDelimiter = (text) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 10);
    let commaScore = 0, semiScore = 0;
    for (const l of lines) {
      commaScore += (l.match(/,/g) || []).length;
      semiScore += (l.match(/;/g) || []).length;
    }
    return semiScore > commaScore ? ";" : ",";
  };
  const parseCSV = (text, delim) => {
    const rows = [];
    let i = 0, cur = "", inQuotes = false;
    const row = [];
    const pushCell = () => { row.push(cur); cur = ""; };
    const pushRow = () => { rows.push(row.slice()); row.length = 0; };
    while (i < text.length) {
      const ch = text[i++];
      if (inQuotes) {
        if (ch === '"') { if (text[i] === '"') { cur += '"'; i++; } else { inQuotes = false; } }
        else cur += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === delim) pushCell();
        else if (ch === "\n" || ch === "\r") {
          if (ch === "\r" && text[i] === "\n") i++;
          pushCell(); pushRow();
        } else cur += ch;
      }
    }
    if (cur.length || row.length) { pushCell(); pushRow(); }
    return rows;
  };

  const importCSVFromFile = (file) => {
    if (!file) return;
    const ok = /\.csv$/i.test(file.name) || (file.type || "").includes("csv") || (file.type || "").includes("text");
    if (!ok) { flash("error", "Please select a .csv file."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const delim = detectDelimiter(text);
        const rowsAll = parseCSV(text, delim);
        const rows = rowsAll.filter(r => r.length && r.some(c => (c ?? "").trim() !== ""));
        if (rows.length < 2) { flash("error", "CSV needs a header and at least one row."); return; }
        const nn = s => String(s ?? "").toLowerCase().replace(/\s+/g, "");
        const header = rows[0].map(nn);
        const colIndex = (name, aliases=[]) => {
          const names = [name, ...aliases].map(nn);
          for (let i=0;i<header.length;i++) if (names.includes(header[i])) return i;
          return -1;
        };
        const idx = {
          id: colIndex("id", []),
          label: colIndex("label", ["name"]),
          role: colIndex("role", []),
          targets: colIndex("targets", []),
          sources: colIndex("sources", []),
        };
        if (idx.id < 0 || idx.label < 0) { flash("error", "CSV header must include at least: id,label"); return; }
        undoStackRef.current.push(snapshot());
        redoStackRef.current = [];
        const parseList = (cell) => {
          const s = String(cell ?? "").trim();
          if (!s) return [];
          if (s.startsWith("[") && s.endsWith("]")) {
            try { const arr = JSON.parse(s); return Array.isArray(arr) ? arr.map(x => String(x)) : []; } catch {}
          }
          return s.split(delim).map(x=>x.trim()).filter(Boolean);
        };
        const byId = new Map();
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          const id = String(row[idx.id] ?? "").trim();
          if (!id) continue;
          const label = String(row[idx.label] ?? "");
          const role = idx.role >= 0 ? String(row[idx.role] ?? "") : "";
          const targets = idx.targets >= 0 ? parseList(row[idx.targets]) : [];
          byId.set(id, { id, label, role, targets, sources: [] });
        }
        const edges = [];
        for (const n of byId.values()) {
          n.targets = n.targets.filter(t => byId.has(t));
          for (const t of n.targets) {
            edges.push({ source: n.id, target: t, weight: 1 });
            const tn = byId.get(t);
            if (!tn.sources.includes(n.id)) tn.sources.push(n.id);
          }
        }
        nodesRef.current = Array.from(byId.values());
        linksRef.current = edges;
        clearSelection();
        initializePositions();
        while (nodesRef.current.some(n => String(n.id) === `new${nextIdRef.current}`)) nextIdRef.current += 1;
        layoutModeRef.current = "force";
        if (simRef.current) {
          simRef.current.nodes(nodesRef.current);
          simRef.current.force("link").id(d => d.id).links(linksRef.current);
          simRef.current.alpha(1).restart();
        }
        apiRef.current.refreshGraph();
        apiRef.current.listNodes();
        flash("success", `Imported ${nodesRef.current.length} nodes and ${linksRef.current.length} edges from CSV.`);
      } catch (e) {
        console.error(e);
        flash("error", "Failed to import CSV: " + (e?.message || e));
      }
    };
    reader.readAsText(file);
  };

  const importGraphMLFromFile = (file) => {
    if (!file) return;
    const ok = /\.graphml$/i.test(file.name) || (file.type || "").includes("xml");
    if (!ok) { flash("error", "Please select a .graphml file."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const xml = String(reader.result || "");
        const dom = new DOMParser().parseFromString(xml, "text/xml");
        let nodeEls = dom.getElementsByTagNameNS("http://graphml.graphdrawing.org/xmlns", "node");
        if (!nodeEls || nodeEls.length === 0) nodeEls = dom.getElementsByTagName("node");
        if (!nodeEls || nodeEls.length === 0) { flash("error", "No <node> elements found in GraphML."); return; }
        undoStackRef.current.push(snapshot());
        redoStackRef.current = [];
        const byId = new Map();
        const textOf = (el) => (el?.textContent ?? "").trim();
        const dataChildren = (node) => {
          const out = [];
          for (const ch of node.childNodes) {
            if (ch.nodeType === 1) {
              const ln = String(ch.localName || ch.nodeName).toLowerCase();
              if (ln.endsWith("data")) out.push(ch);
            }
          }
          return out;
        };
        for (const node of Array.from(nodeEls)) {
          const id = String(node.getAttribute("id") ?? "").trim();
          if (!id) continue;
          let label = "", role = "", targetsStr = "", sourcesStr = "";
          for (const d of dataChildren(node)) {
            const key = String(d.getAttribute("key") ?? "").trim();
            const val = textOf(d);
            if (key === "d_label") label = val;
            else if (key === "d_role") role = val;
            else if (key === "d_targets") targetsStr = val;
            else if (key === "d_sources") sourcesStr = val;
          }
          const list = (s) => String(s || "").split(",").map(x => x.trim()).filter(Boolean);
          byId.set(id, { id, label, role, targets: list(targetsStr), sources: [] });
        }
        const edges = [];
        for (const n of byId.values()) {
          n.targets = n.targets.filter(t => byId.has(t));
          for (const t of n.targets) {
            edges.push({ source: n.id, target: t, weight: 1 });
            const tn = byId.get(t);
            if (!tn.sources.includes(n.id)) tn.sources.push(n.id);
          }
        }
        nodesRef.current = Array.from(byId.values());
        linksRef.current = edges;
        clearSelection();
        initializePositions();
        while (nodesRef.current.some(n => String(n.id) === `new${nextIdRef.current}`)) nextIdRef.current += 1;
        layoutModeRef.current = "force";
        if (simRef.current) {
          simRef.current.nodes(nodesRef.current);
          simRef.current.force("link").id(d => d.id).links(linksRef.current);
          simRef.current.alpha(1).restart();
        }
        apiRef.current.refreshGraph();
        apiRef.current.listNodes();
        flash("success", `Imported ${nodesRef.current.length} nodes and ${linksRef.current.length} edges from GraphML.`);
      } catch (e) {
        console.error(e);
        flash("error", "Failed to import GraphML: " + (e?.message || e));
      }
    };
    reader.readAsText(file);
  };

  const initializePositions = () => {
    const s = getSize();
    nodesRef.current.forEach((n, i) => {
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) {
        const angle = (i / Math.max(1, nodesRef.current.length)) * 2 * Math.PI;
        const radius = 100;
        n.x = s.innerW / 2 + radius * Math.cos(angle);
        n.y = s.innerH / 2 + radius * Math.sin(angle);
      }
      n.fx = null; n.fy = null;
      if (!n.vx) n.vx = (Math.random() - 0.5) * 0.5;
      if (!n.vy) n.vy = (Math.random() - 0.5) * 0.5;
    });
  };

  const snapshot = () => ({
    nodes: nodesRef.current.map(n => ({
      id: n.id, label: n.label, x: n.x, y: n.y,
      role: n.role ?? "", targets: [...(n.targets ?? [])], sources: [...(n.sources ?? [])],
    })),
    links: linksRef.current.map(l => ({
      source: getId(l.source), target: getId(l.target), weight: l.weight ?? 1,
    })),
  });
  const restore = snap => {
    nodesRef.current = snap.nodes.map(n => ({ ...n }));
    linksRef.current = snap.links.map(l => ({ ...l }));
    if (selectionRef.current?.type === "node" &&
        !nodesRef.current.some(n => idEq(n.id, selectionRef.current.id))) {
      clearSelection();
    }
    if (selectionRef.current?.type === "edge") {
      const { source, target } = selectionRef.current;
      const ok = linksRef.current.some(l => {
        const sid = String(getId(l.source));
        const tid = String(getId(l.target));
        return (idEq(sid, source) && idEq(tid, target)) || (idEq(sid, target) && idEq(tid, source));
      });
      if (!ok) clearSelection();
    }
    apiRef.current.refreshGraph?.();
  };

  const updateStatus = () => {
    if (!statusRef.current) return;
    const n = nodesRef.current.length;
    const m = linksRef.current.length;
    const mode =
      layoutModeRef.current === "hier" ? "Hierarchical (locked)" :
      layoutModeRef.current === "circ" ? "Circular (locked)" :
      layoutModeRef.current === "grid" ? "Grid" :
      "Force";
    const shown = visibleGraph().nodes.length;
    statusRef.current.textContent = `Nodes: ${n} (shown: ${shown}) | Edges: ${m} | Pan: ${panEnabledRef.current ? "ON" : "OFF"} | Layout: ${mode} | Grid: ${gridEnabledRef.current ? gridSizeRef.current + "px" : "OFF"}`;
    if (pathRef.current?.nodes?.size > 0) {
      statusRef.current.textContent += ` | Path: ${pathRef.current.nodes.size} nodes, w=${pathRef.current.distance}`;
    }
  };

  const computeVisibleAnalytics = () => {
    const { nodes, links } = visibleGraph();
    const ids = nodes.map(n => String(n.id));
    const idSet = new Set(ids);
    const deg = new Map(ids.map(id => [id, 0]));
    links.forEach(l => {
      const s = String(getId(l.source));
      const t = String(getId(l.target));
      if (idSet.has(s) && idSet.has(t)) {
        deg.set(s, (deg.get(s) || 0) + 1);
        deg.set(t, (deg.get(t) || 0) + 1);
      }
    });
    const adj = new Map(ids.map(id => [id, []]));
    links.forEach(l => {
      const s = String(getId(l.source));
      const t = String(getId(l.target));
      if (idSet.has(s) && idSet.has(t)) {
        adj.get(s).push(t);
        adj.get(t).push(s);
      }
    });
    const comp = new Map();
    let cid = 0;
    for (const id of ids) {
      if (comp.has(id)) continue;
      const q = [id];
      comp.set(id, cid);
      for (let qi = 0; qi < q.length; qi++) {
        const u = q[qi];
        for (const v of adj.get(u)) {
          if (!comp.has(v)) {
            comp.set(v, cid);
            q.push(v);
          }
        }
      }
      cid++;
    }
    const byId = new Map(nodesRef.current.map(n => [String(n.id), n]));
    ids.forEach(id => {
      const n = byId.get(id);
      if (n) { n._degree = deg.get(id) || 0; n._comp = comp.get(id) ?? -1; }
    });
  };

  const computeNeighboursFor = (centerId) => {
    const id = String(centerId);
    const neigh = new Set([id]);
    const edges = new Set();
    for (const l of linksRef.current) {
      const s = String(getId(l.source));
      const t = String(getId(l.target));
      if (idEq(s, id)) { neigh.add(t); edges.add(undirKey(s, t)); }
      else if (idEq(t, id)) { neigh.add(s); edges.add(undirKey(s, t)); }
    }
    expandStateRef.current = { active: true, center: id, nodes: neigh, edges };
  };
  const clearExpansionState = () => { expandStateRef.current = { active: false, center: null, nodes: new Set(), edges: new Set() }; };

  const edgeIsSelected = (d) => {
    if (!selectionRef.current || selectionRef.current.type !== "edge") return false;
    const sid = String(getId(d.source)); const tid = String(getId(d.target));
    const { source, target } = selectionRef.current;
    return (idEq(sid, source) && idEq(tid, target)) || (idEq(sid, target) && idEq(tid, source));
  };

  const edgeBaseWidth = (d) => {
    const w = Number(d.weight);
    const weight = Number.isFinite(w) ? Math.max(0, Math.abs(w)) : 1;
    const scaled = Math.sqrt(weight);
    const norm = scaled / (1 + scaled);
    return EDGE_MIN + norm * (EDGE_MAX - EDGE_MIN);
  };

  const updateSelectionStyles = () => {
    if (!gRef.current) return;
    const onPathNode = id => pathRef.current?.nodes?.has(String(id)) ?? false;
    const onPathEdge = d => {
      const sid = String(getId(d.source));
      const tid = String(getId(d.target));
      return pathRef.current?.edges?.has(undirKey(sid, tid)) ?? false;
    };
    const expansion = expandStateRef.current;

    const nodeSel = gRef.current.selectAll("g.node");
    nodeSel.style("opacity", d => (!expansion.active ? 1 : (expansion.nodes.has(String(d.id)) ? 1 : 0.15)));

    nodeSel.select("circle")
      .attr("stroke", d => {
        const isSel = selectionRef.current?.type === "node" && idEq(d.id, selectionRef.current.id);
        if (isSel) return "red";
        if (onPathNode(d.id)) return "#f39c12";
        return "none";
      })
      .attr("stroke-width", d => {
        const isSel = selectionRef.current?.type === "node" && idEq(d.id, selectionRef.current.id);
        if (isSel) return 3;
        if (onPathNode(d.id)) return 3;
        return 0;
      })
      .attr("r", d => (expandStateRef.current.active && expandStateRef.current.nodes.has(String(d.id)) ? NODE_R_EXPANDED : NODE_R))
      .attr("fill", "#69b3a2");

    gRef.current.selectAll("line.link")
      .style("opacity", d => {
        if (!expansion.active) return 1;
        const sid = String(getId(d.source));
        const tid = String(getId(d.target));
        return expansion.edges.has(undirKey(sid, tid)) ? 1 : 0.15;
      })
      .attr("stroke", d => {
        if (edgeIsSelected(d)) return "red";
        if (onPathEdge(d)) return "#f39c12";
        return "#999";
      })
      .attr("stroke-width", d => {
        const base = edgeBaseWidth(d);
        if (edgeIsSelected(d)) return Math.min(EDGE_MAX + 2, base + 2);
        if (onPathEdge(d)) return Math.min(EDGE_MAX + 2, base + 2);
        return base;
      })
      .attr("marker-end", d => {
        if (edgeIsSelected(d)) return "url(#arrow-selected)";
        if (onPathEdge(d)) return "url(#arrow-path)";
        return "url(#arrow-default)";
      });

    gRef.current.selectAll("text.degree-label").attr("display", showDegreeRef.current ? null : "none");
  };

  useEffect(() => {
    nodesRef.current = [];
    linksRef.current = [];
    undoStackRef.current = [];
    redoStackRef.current = [];
    versionsRef.current = [];
    versionIdRef.current = 1;
    savedVersionsRef.current = [];
    savedNextIdRef.current = 1;
    clearSelection();
    layoutModeRef.current = "force";
    clearExpansionState();
    showDegreeRef.current = false; setShowDegree(false);

    const root = d3.select(containerRef.current);
    root.selectAll("*").remove();

    const margin = { top: 10, right: 30, bottom: 30, left: 40 };
    const svg = root.append("svg").attr("width", "100%").attr("height", "100%");
    svgRef.current = svg;

    const defs = svg.append("defs");
    defsRef.current = defs;

    const makeArrow = (id, color) => {
      const m = defs.append("marker")
        .attr("id", id)
        .attr("viewBox", "0 0 10 10")
        .attr("refX", ARROW_REF_X)
        .attr("refY", 5)
        .attr("markerWidth", ARROW_SIZE)
        .attr("markerHeight", ARROW_SIZE)
        .attr("orient", "auto")
        .attr("markerUnits", "userSpaceOnUse");
      m.append("path").attr("d", "M0,0 L10,5 L0,10 Z").attr("fill", color);
    };
    makeArrow("arrow-default", "#999");
    makeArrow("arrow-selected", "red");
    makeArrow("arrow-path", "#f39c12");

    const bg = svg
      .append("rect").attr("class", "zoom-bg")
      .attr("width", "100%").attr("height", "100%")
      .style("fill", "transparent")
      .style("pointer-events", "all");

    const zoomLayer = svg.append("g");

    const renderPositions = () => {
      if (!gRef.current) return;
      const idToNode = new Map(nodesRef.current.map(n => [String(n.id), n]));

      gRef.current.selectAll("line.link")
        .attr("x1", d => (typeof d.source === "object" ? d.source.x : idToNode.get(String(d.source))?.x ?? 0))
        .attr("y1", d => (typeof d.source === "object" ? d.source.y : idToNode.get(String(d.source))?.y ?? 0))
        .attr("x2", d => (typeof d.target === "object" ? d.target.x : idToNode.get(String(d.target))?.x ?? 0))
        .attr("y2", d => (typeof d.target === "object" ? d.target.y : idToNode.get(String(d.target))?.y ?? 0));

      gRef.current.selectAll("g.node").attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    };

    const gridLayer = zoomLayer.append("g"); gridLayerRef.current = gridLayer;
    const gridRect = gridLayer
      .append("rect").attr("class", "grid-rect")
      .attr("x", -5000).attr("y", -5000).attr("width", 10000).attr("height", 10000)
      .style("pointer-events", "none").attr("fill", "none");
    gridRectRef.current = gridRect;

    const g = zoomLayer.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    gRef.current = g;

    bg.on("click", () => clearSelection());

    let { innerW, innerH } = getSize();

    simRef.current = d3
      .forceSimulation()
      .force("link", d3.forceLink().id(d => d.id))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(innerW / 2, innerH / 2))
      .velocityDecay(0.8);

    const zoomBehavior = d3.zoom()
      .scaleExtent([0.25, 6])
      .filter(event => {
        if (event.type === "wheel") return true;
        if (!panEnabledRef.current) return false;
        return event.type === "mousedown" || event.type === "touchstart";
      })
      .on("zoom", event => { zoomLayer.attr("transform", event.transform); });

    svg.call(zoomBehavior).on("dblclick.zoom", null);
    zoomBehaviorRef.current = zoomBehavior;

    const ensureGridPattern = () => {
      const id = "gridPattern";
      let pat = defsRef.current.select(`#${id}`);
      if (pat.empty()) {
        pat = defsRef.current.append("pattern").attr("id", id).attr("patternUnits", "userSpaceOnUse");
      }
      const gs = gridSizeRef.current;
      pat.attr("width", gs).attr("height", gs);
      pat.selectAll("*").remove();
      pat.append("circle").attr("cx", 0).attr("cy", 0).attr("r", 2).attr("fill", "#17416cff");
      if (gs >= 12) pat.append("circle").attr("cx", 0).attr("cy", 0).attr("r", 2.6).attr("fill", "#7b8794").attr("opacity", 0.35);
    };

    const setGridVisible = (on) => {
      if (on) { ensureGridPattern(); gridRectRef.current.attr("fill", "url(#gridPattern)"); }
      else { gridRectRef.current.attr("fill", "none"); }
    };

    const makeDrag = () =>
      d3.drag()
        .on("start", (event, d) => {
          const inForce = layoutModeRef.current === "force" && !gridEnabledRef.current;
          if (inForce) { if (!event.active) simRef.current.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
        })
        .on("drag", (event, d) => {
          const inForce = layoutModeRef.current === "force" && !gridEnabledRef.current;
          const inGrid = gridEnabledRef.current;
          if (inForce) { d.fx = event.x; d.fy = event.y; }
          else if (inGrid) { d.x = event.x; d.y = event.y; renderPositions(); }
        })
        .on("end", (event, d) => {
          const inForce = layoutModeRef.current === "force" && !gridEnabledRef.current;
          const inGrid = gridEnabledRef.current;
          if (inGrid) {
            const gs = gridSizeRef.current;
            const snap = v => Math.round(v / gs) * gs;
            d.x = snap(d.x ?? 0); d.y = snap(d.y ?? 0);
          }
          if (inForce) { if (!event.active) simRef.current.alphaTarget(0); d.fx = null; d.fy = null; }
          renderPositions();
        });

    const getLinkKey = (d) => {
      const s = typeof d.source === "object" ? d.source.id : d.source;
      const t = typeof d.target === "object" ? d.target.id : d.target;
      return `${s}-${t}`;
    };

    const updateGraph = () => {
      const drag = makeDrag();
      const { nodes: visNodes, links: visLinks } = visibleGraph();

      if (showDegreeRef.current) computeVisibleAnalytics();

      let linkSel = g.selectAll("line.link").data(visLinks, getLinkKey);
      linkSel.exit().remove();
      const linkEnter = linkSel.enter()
        .append("line").attr("class", "link").attr("stroke", "#999")
        .attr("stroke-width", d => edgeBaseWidth(d)).style("cursor", "pointer")
        .attr("marker-end", "url(#arrow-default)")
        .on("click", (event, d) => {
          event.stopPropagation();
          const sid = String(getId(d.source));
          const tid = String(getId(d.target));
          openPanelFor({ type: "edge", source: sid, target: tid });
          updateSelectionStyles();
        });
      linkSel = linkEnter.merge(linkSel).attr("stroke-width", d => edgeBaseWidth(d));

      let nodeSel = g.selectAll("g.node").data(visNodes, d => d.id);
      nodeSel.exit().remove();

      const nodeEnter = nodeSel.enter().append("g").attr("class", "node").call(drag);

      nodeEnter.append("circle").attr("r", NODE_R).attr("fill", "#69b3a2")
        .style("cursor", "pointer").style("pointer-events", "auto")
        .on("click", (event, d) => { event.stopPropagation(); openPanelFor({ type: "node", id: d.id }); updateSelectionStyles(); });

      nodeEnter.append("text")
        .text(d => d.label).attr("text-anchor", "middle").attr("dy", "0.35em").attr("pointer-events", "none")
        .style("font-size", `${LABEL_FONT}px`).style("font-family", "system-ui, -apple-system, Segoe UI, Roboto, Arial")
        .style("paint-order", "stroke").style("stroke", "#69b3a2").style("stroke-width", 3);

      nodeEnter.append("text")
        .attr("class", "degree-label").attr("text-anchor", "middle").attr("dy", "1.6em").attr("pointer-events", "none")
        .style("font-size", `${DEGREE_FONT}px`).style("font-family", "system-ui, -apple-system, Segoe UI, Roboto, Arial").style("fill", "#334155")
        .text(d => String(d._degree ?? 0));

      nodeSel = nodeEnter.merge(nodeSel);
      nodeSel.select("text:not(.degree-label)").text(d => d.label);
      nodeSel.select("text.degree-label").text(d => String(d._degree ?? 0)).attr("display", showDegreeRef.current ? null : "none");

      nodeSel.on(".drag", null); nodeSel.call(drag);

      simRef.current.nodes(nodesRef.current);
      simRef.current.force("link").id(d => d.id).links(linksRef.current);

      simRef.current.on("tick", () => {
        const idToNode = new Map(nodesRef.current.map(n => [String(n.id), n]));
        const sx = d => (typeof d.source === "object" ? d.source.x : idToNode.get(String(d.source))?.x ?? 0);
        const sy = d => (typeof d.source === "object" ? d.source.y : idToNode.get(String(d.source))?.y ?? 0);
        const tx = d => (typeof d.target === "object" ? d.target.x : idToNode.get(String(d.target))?.x ?? 0);
        const ty = d => (typeof d.target === "object" ? d.target.y : idToNode.get(String(d.target))?.y ?? 0);
        linkSel.attr("x1", sx).attr("y1", sy).attr("x2", tx).attr("y2", ty);
        nodeSel.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });

      if (layoutModeRef.current !== "force") renderPositions();
      if (layoutModeRef.current === "force") { g.selectAll("circle.ring").remove(); simRef.current.alpha(0.6).restart(); }

      updateStatus(); updateSelectionStyles();
    };

    apiRef.current.__setGridVisible = setGridVisible;
    apiRef.current.__ensureGridPattern = ensureGridPattern;
    apiRef.current.refreshGraph = () => updateGraph();

    const pushHistory = () => {
      undoStackRef.current.push(snapshot());
      if (undoStackRef.current.length > 200) undoStackRef.current.shift();
      setUiTick(t => t + 1);
    };

    const recordVersion = (event, payload = {}) => {
      versionsRef.current.push({ vid: versionIdRef.current++, at: new Date().toISOString(), event, payload, state: snapshot() });
    };

    const addUnique = (arr, v) => (arr.includes(v) ? arr : [...arr, v]);
    const removeVal = (arr, v) => arr.filter(x => x !== v);

    apiRef.current.addNode = label => {
      const name = String(label ?? "").trim();
      if (!name) return;
      pushHistory(); redoStackRef.current = [];
      let id; do { id = `new${nextIdRef.current++}`; } while (nodesRef.current.some(n => String(n.id) === id));
      const s = getSize();
      const cx = s.innerW / 2 + (Math.random() - 0.5) * 50;
      const cy = s.innerH / 2 + (Math.random() - 0.5) * 50;
      nodesRef.current.push({ id, label: name, x: cx, y: cy, role: "", targets: [], sources: [] });
      apiRef.current.refreshGraph(); apiRef.current.listNodes();
      recordVersion("add_node", { id, label: name }); flash("success", `Added node "${name}"`);
    };

    apiRef.current.listNodes = () => {
      const rows = nodesRef.current.map(n => ({
        id: n.id, label: n.label, role: n.role ?? "",
        targets: (n.targets ?? []).join(","), sources: (n.sources ?? []).join(","),
      }));
      setNodeDump(rows); updateStatus();
    };

    apiRef.current.addLink = (sourceId, targetId) => {
      const sId = String(sourceId ?? "").trim(); const tId = String(targetId ?? "").trim();
      if (!sId || !tId) return;
      const sNode = nodesRef.current.find(n => idEq(n.id, sId));
      const tNode = nodesRef.current.find(n => idEq(n.id, tId));
      if (!sNode || !tNode) { flash("error", "Can't find one of the nodes. Use valid IDs."); return; }
      if (idEq(sNode.id, tNode.id)) { flash("error", "Can't connect a node to itself."); return; }
      const exists = linksRef.current.some(l => {
        const sid = getId(l.source); const tid = getId(l.target);
        return (idEq(sid, sNode.id) && idEq(tid, tNode.id)) || (idEq(sid, tNode.id) && idEq(tid, sNode.id));
      });
      if (exists) { flash("info", "This edge already exists."); return; }
      pushHistory(); redoStackRef.current = [];
      linksRef.current.push({ source: sNode.id, target: tNode.id, weight: 1 });
      sNode.targets = addUnique(sNode.targets ?? [], tNode.id);
      tNode.sources = addUnique(tNode.sources ?? [], sNode.id);
      apiRef.current.refreshGraph(); apiRef.current.listNodes();
      recordVersion("add_link", { source: sNode.id, target: tNode.id });
      flash("success", `Linked ${sNode.id} → ${tNode.id}`);
    };

    apiRef.current.addLinkSmart = (a, b) => {
      const ida = resolveIdFromIdOrLabel(a);
      const idb = resolveIdFromIdOrLabel(b);
      const sNode = nodesRef.current.find(n => idEq(n.id, ida));
      const tNode = nodesRef.current.find(n => idEq(n.id, idb));
      if (!sNode || !tNode) {
        flash("error", `Could not find both nodes: "${a}" and "${b}" (ID or name).`);
        return;
      }
      if (idEq(sNode.id, tNode.id)) {
        flash("error", "Cannot connect a node to itself.");
        return;
      }
      const exists = linksRef.current.some(l => {
        const sid = getId(l.source); const tid = getId(l.target);
        return (idEq(sid, sNode.id) && idEq(tid, tNode.id)) ||
              (idEq(sid, tNode.id) && idEq(tid, sNode.id));
      });
      if (exists) { flash("info", "This edge already exists."); return; }
      undoStackRef.current.push(snapshot());
      redoStackRef.current = [];
      linksRef.current.push({ source: sNode.id, target: tNode.id, weight: 1 });
      sNode.targets = (sNode.targets ?? []).includes(tNode.id) ? sNode.targets : [...(sNode.targets ?? []), tNode.id];
      tNode.sources = (tNode.sources ?? []).includes(sNode.id) ? tNode.sources : [...(tNode.sources ?? []), sNode.id];
      apiRef.current.refreshGraph();
      apiRef.current.listNodes();
      recordVersion("add_link", { source: sNode.id, target: tNode.id });
      flash("success", `Linked ${sNode.id} → ${tNode.id}`);
    };

    apiRef.current.removeLink = (sourceId, targetId) => {
      const sId = String(sourceId ?? "").trim(); const tId = String(targetId ?? "").trim();
      if (!sId || !tId) return;
      const anyMatch = linksRef.current.some(l => {
        const sid = getId(l.source); const tid = getId(l.target);
        return (idEq(sid, sId) && idEq(tid, tId)) || (idEq(sid, tId) && idEq(tid, sId));
      });
      if (!anyMatch) { flash("info", `No edge between "${sId}" and "${tId}".`); return; }
      pushHistory(); redoStackRef.current = [];
      linksRef.current = linksRef.current.filter(l => {
        const sid = getId(l.source); const tid = getId(l.target);
        const match = (idEq(sid, sId) && idEq(tid, tId)) || (idEq(sid, tId) && idEq(tid, sId));
        return !match;
      });
      const sNode = nodesRef.current.find(n => idEq(n.id, sId));
      const tNode = nodesRef.current.find(n => idEq(n.id, tId));
      if (sNode && tNode) {
        sNode.targets = (sNode.targets ?? []).filter(x => !idEq(x, tNode.id));
        tNode.sources = (tNode.sources ?? []).filter(x => !idEq(x, sNode.id));
        tNode.targets = (tNode.targets ?? []).filter(x => !idEq(x, sNode.id));
        sNode.sources = (sNode.sources ?? []).filter(x => !idEq(x, tNode.id));
      }
      if (selectionRef.current?.type === "edge") {
        const { source, target } = selectionRef.current;
        if ((idEq(sId, source) && idEq(tId, target)) || (idEq(sId, target) && idEq(tId, source))) clearSelection();
      }
      apiRef.current.refreshGraph(); apiRef.current.listNodes();
      recordVersion("remove_link", { source: sId, target: tId });
      flash("success", `Removed edge ${sId} — ${tId}`);
    };

    apiRef.current.removeNodeSmart = (idOrName) => {
      const id = resolveIdFromIdOrLabel(idOrName);
      const exists = nodesRef.current.some((n) => idEq(n.id, id));
      if (!exists) {
        flash("error", `Could not find node with ID or name "${idOrName}".`);
        return;
      }
      apiRef.current.removeNode(id);
    };

    apiRef.current.removeLinkSmart = (a, b) => {
      const ida = resolveIdFromIdOrLabel(a);
      const idb = resolveIdFromIdOrLabel(b);
      const haveA = nodesRef.current.some((n) => idEq(n.id, ida));
      const haveB = nodesRef.current.some((n) => idEq(n.id, idb));
      if (!haveA || !haveB) {
        flash("error", `Could not find both nodes: "${a}" and "${b}" (ID or name).`);
        return;
      }
      apiRef.current.removeLink(ida, idb);
    };

    apiRef.current.removeNode = nodeId => {
      const id = String(nodeId ?? "").trim();
      if (!id) return;
      const exists = nodesRef.current.some(n => idEq(n.id, id));
      if (!exists) { flash("info", `No node with id "${id}".`); return; }
      pushHistory(); redoStackRef.current = [];
      nodesRef.current = nodesRef.current.filter(n => !idEq(n.id, id));
      linksRef.current = linksRef.current.filter(l => {
        const sid = getId(l.source); const tid = getId(l.target);
        const involves = idEq(sid, id) || idEq(tid, id);
        if (involves) {
          const sNode = nodesRef.current.find(n => idEq(n.id, sid));
          const tNode = nodesRef.current.find(n => idEq(n.id, tid));
          if (sNode) sNode.targets = (sNode.targets ?? []).filter(x => !idEq(x, tid));
          if (tNode) tNode.sources = (tNode.sources ?? []).filter(x => !idEq(x, sid));
        }
        return !involves;
      });
      if (selectionRef.current?.type === "node" && idEq(selectionRef.current.id, id)) clearSelection();
      apiRef.current.refreshGraph(); apiRef.current.listNodes();
      recordVersion("remove_node", { id });
      flash("success", `Removed node "${id}"`);
    };

    apiRef.current.togglePan = () => {
      panEnabledRef.current = !panEnabledRef.current;
      setPanEnabled(panEnabledRef.current);
      svg.call(zoomBehavior);
      updateStatus();
    };

    apiRef.current.undo = () => {
      if (undoStackRef.current.length === 0) return flash("info", "Nothing to undo");
      const currentSnap = snapshot();
      const prev = undoStackRef.current.pop();
      redoStackRef.current.push(currentSnap);
      restore(prev);
      setUiTick(t => t + 1);
      apiRef.current.listNodes();
    };

    apiRef.current.redo = () => {
      if (redoStackRef.current.length === 0) return flash("info", "Nothing to redo");
      const currentSnap = snapshot();
      const next = redoStackRef.current.pop();
      undoStackRef.current.push(currentSnap);
      restore(next);
      setUiTick(t => t + 1);
      apiRef.current.listNodes();
    };

    apiRef.current.layoutHierarchical = (orientation = "TB") => {
      if (simRef.current) simRef.current.stop();
      if (gRef.current) gRef.current.selectAll("circle.ring").remove();

      const nodes = nodesRef.current.map(n => ({ id: String(n.id), ref: n }));
      const edges = linksRef.current.map(l => {
        const s = typeof l.source === "object" ? String(l.source.id) : String(l.source);
        const t = typeof l.target === "object" ? String(l.target.id) : String(l.target);
        return { s, t };
      });

      if (nodes.length === 0) { flash("info", "No nodes to layout"); return; }

      const byId = new Map(nodes.map(n => [n.id, n.ref]));
      const indeg = new Map(nodes.map(n => [n.id, 0]));
      const children = new Map(nodes.map(n => [n.id, []]));
      const parents = new Map(nodes.map(n => [n.id, []]));
      edges.forEach(e => {
        if (!byId.has(e.s) || !byId.has(e.t)) return;
        children.get(e.s).push(e.t);
        parents.get(e.t).push(e.s);
        indeg.set(e.t, (indeg.get(e.t) || 0) + 1);
      });

      const layer = new Map(nodes.map(n => [n.id, 0]));
      const q = [];
      for (const [id, d] of indeg.entries()) if (d === 0) q.push(id);
      if (q.length === 0) {
        let minDeg = Math.min(...Array.from(indeg.values()));
        for (const [id, d] of indeg.entries()) if (d === minDeg) q.push(id);
      }

      const indegWork = new Map(indeg);
      const visited = new Set();
      while (q.length) {
        const u = q.shift(); visited.add(u);
        for (const v of children.get(u)) {
          layer.set(v, Math.max(layer.get(v), (layer.get(u) || 0) + 1));
          indegWork.set(v, indegWork.get(v) - 1);
          if (indegWork.get(v) === 0) q.push(v);
        }
      }

      const unvisited = nodes.filter(n => !visited.has(n.id)).map(n => n.id);
      if (unvisited.length > 0) {
        const maxLayer = Math.max(0, ...Array.from(layer.values()));
        const cycleLayer = maxLayer + 1;
        unvisited.forEach(id => layer.set(id, cycleLayer));
      }

      let changed = true, guard = 0;
      while (changed && guard++ < nodes.length * 3) {
        changed = false;
        edges.forEach(({ s: u, t: v }) => {
          const want = (layer.get(u) || 0) + 1;
          if ((layer.get(v) || 0) < want) { layer.set(v, want); changed = true; }
        });
      }

      const maxL = Math.max(...Array.from(layer.values()));
      const layers = Array.from({ length: maxL + 1 }, () => []);
      nodes.forEach(n => layers[layer.get(n.id) || 0].push(n.id));

      for (let L = 1; L < layers.length; L++) {
        layers[L].sort((a, b) => {
          const pa = parents.get(a) || [];
          const pb = parents.get(b) || [];
          const prev = layers[L - 1];
          const avg = arr => arr.length ? arr.reduce((s, p) => s + (prev.indexOf(p) + 1), 0) / arr.length : 0;
          return avg(pa) - avg(pb);
        });
      }

      const s = getSize();
      const LAYER_GAP = 140, NODE_GAP = 60;

      const maxLayerSize = Math.max(...layers.map(arr => arr.length));
      const totalW_TB = (layers.length - 1) * LAYER_GAP;
      const totalH_TB = (maxLayerSize - 1) * NODE_GAP;
      const totalW_LR = (maxLayerSize - 1) * NODE_GAP;
      const totalH_LR = (layers.length - 1) * LAYER_GAP;

      const leftPadTB = Math.max(20, (s.innerW - totalW_TB) / 2);
      const topPadTB = Math.max(20, (s.innerH - totalH_TB) / 2);
      const leftPadLR = Math.max(20, (s.innerW - totalW_LR) / 2);
      const topPadLR = Math.max(20, (s.innerH - totalH_LR) / 2);

      const pos = new Map();
      for (let L = 0; L < layers.length; L++) {
        const ids = layers[L];
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          const xTB = leftPadTB + L * LAYER_GAP;
          const yTB = topPadTB + i * NODE_GAP;
          const xLR = leftPadLR + i * NODE_GAP;
          const yLR = topPadLR + L * LAYER_GAP;
          const x = orientation === "LR" ? xLR : xTB;
          const y = orientation === "LR" ? yLR : yTB;
          pos.set(id, { x, y });
        }
      }

      nodesRef.current.forEach(n => {
        const p = pos.get(String(n.id));
        if (p) { n.x = p.x; n.y = p.y; n.fx = null; n.fy = null; }
      });

      layoutModeRef.current = "hier";

      const idToNode = new Map(nodesRef.current.map(n => [String(n.id), n]));
      gRef.current.selectAll("line.link")
        .attr("x1", d => idToNode.get(String(typeof d.source === "object" ? d.source.id : d.source))?.x ?? 0)
        .attr("y1", d => idToNode.get(String(typeof d.source === "object" ? d.source.id : d.source))?.y ?? 0)
        .attr("x2", d => idToNode.get(String(typeof d.target === "object" ? d.target.id : d.target))?.x ?? 0)
        .attr("y2", d => idToNode.get(String(typeof d.target === "object" ? d.target.id : d.target))?.y ?? 0);

      gRef.current.selectAll("g.node").attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);

      apiRef.current.listNodes(); updateSelectionStyles();
    };

    apiRef.current.layoutCircular = (opts = {}) => {
      const { startAngle = -Math.PI / 2, clockwise = true, radius = null, order = "id", innerMargin = 40 } = opts;
      if (!nodesRef.current.length) return;

      if (simRef.current) simRef.current.stop();
      if (gRef.current) gRef.current.selectAll("circle.ring").remove();

      const byId = new Map(nodesRef.current.map(n => [String(n.id), n]));
      const s = getSize();
      const cx = s.innerW / 2;
      const cy = s.innerH / 2;
      const dir = clockwise ? 1 : -1;

      let orderIds;
      if (order === "label") {
        orderIds = [...nodesRef.current].sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true })).map(n => String(n.id));
      } else {
        orderIds = [...nodesRef.current].sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true })).map(n => String(n.id));
      }

      const N = orderIds.length;
      const maxRAvail = Math.max(60, Math.min(s.innerW, s.innerH) * 0.5 - innerMargin);
      const R = radius !== null ? Math.max(20, radius) : maxRAvail;
      const step = (2 * Math.PI) / N;

      orderIds.forEach((id, i) => {
        const node = byId.get(id);
        const angle = startAngle + dir * (i * step);
        node.x = cx + R * Math.cos(angle);
        node.y = cy + R * Math.sin(angle);
        node.fx = null; node.fy = null;
      });

      layoutModeRef.current = "circ";

      const idToNode = new Map(nodesRef.current.map(n => [String(n.id), n]));
      gRef.current.selectAll("line.link")
        .attr("x1", d => idToNode.get(String(typeof d.source === "object" ? d.source.id : d.source))?.x ?? 0)
        .attr("y1", d => idToNode.get(String(typeof d.source === "object" ? d.source.id : d.source))?.y ?? 0)
        .attr("x2", d => idToNode.get(String(typeof d.target === "object" ? d.target.id : d.target))?.x ?? 0)
        .attr("y2", d => idToNode.get(String(typeof d.target === "object" ? d.target.id : d.target))?.y ?? 0);

      gRef.current.selectAll("g.node").attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);

      gRef.current.selectAll("circle.ring")
        .data([R])
        .join(
          enter => enter.append("circle")
            .attr("class", "ring").attr("cx", cx).attr("cy", cy).attr("r", d => d)
            .attr("fill", "none").attr("stroke", "#dddddd").attr("stroke-dasharray", "4 4"),
          update => update,
          exit => exit.remove()
        );

      apiRef.current.listNodes(); updateSelectionStyles();
    };

    apiRef.current.startForce = () => {
      if (gridEnabledRef.current) { flash("info", "Turn off Grid to use Force layout."); return; }
      layoutModeRef.current = "force";
      if (gRef.current) gRef.current.selectAll("circle.ring").remove();

      const s = getSize();
      nodesRef.current.forEach((n, i) => {
        if (!Number.isFinite(n.x)) { const angle = (i / Math.max(1, nodesRef.current.length)) * 2 * Math.PI; n.x = s.innerW / 2 + 100 * Math.cos(angle); }
        if (!Number.isFinite(n.y)) { const angle = (i / Math.max(1, nodesRef.current.length)) * 2 * Math.PI; n.y = s.innerH / 2 + 100 * Math.sin(angle); }
        n.fx = null; n.fy = null;
      });

      if (simRef.current) {
        simRef.current.nodes(nodesRef.current);
        simRef.current.force("link").id(d => d.id).links(linksRef.current);
        simRef.current.alpha(1).restart();
      }

      apiRef.current.refreshGraph(); updateSelectionStyles();
    };

    const dijkstraShortestPath = (srcId, dstId) => {
      const src = String(srcId ?? "").trim();
      const dst = String(dstId ?? "").trim();
      if (!src || !dst) return null;
      const haveId = new Set(nodesRef.current.map(n => String(n.id)));
      if (!haveId.has(src) || !haveId.has(dst)) {
        flash("error", "One or both node IDs do not exist.");
        return null;
      }
      if (src === dst) return { path: [src], distance: 0 };

      const adj = new Map();
      nodesRef.current.forEach(n => adj.set(String(n.id), []));
      for (const l of linksRef.current) {
        const s = String(getId(l.source));
        const t = String(getId(l.target));
        if (!adj.has(s) || !adj.has(t)) continue;
        const wRaw = Number(l.weight);
        if (Number.isFinite(wRaw) && wRaw < 0) {
          flash("error", "Negative weights are not supported by Dijkstra.");
          return null;
        }
        const w = Number.isFinite(wRaw) ? wRaw : 1;
        adj.get(s).push({ v: t, w });
      }

      const dist = new Map(Array.from(adj.keys()).map(k => [k, Infinity]));
      const prev = new Map();
      const visited = new Set();
      dist.set(src, 0);

      while (visited.size < adj.size) {
        let u = null, best = Infinity;
        for (const [k, d] of dist.entries()) {
          if (!visited.has(k) && d < best) { best = d; u = k; }
        }
        if (u == null) break;
        if (u === dst) break;
        visited.add(u);
        for (const { v, w } of adj.get(u)) {
          if (visited.has(v)) continue;
          const alt = dist.get(u) + w;
          if (alt < dist.get(v)) { dist.set(v, alt); prev.set(v, u); }
        }
      }

      if (!prev.has(dst) && src !== dst) return null;

      const path = [];
      let cur = dst;
      path.push(cur);
      while (prev.has(cur)) {
        cur = prev.get(cur);
        path.push(cur);
      }
      path.reverse();
      return { path, distance: dist.get(dst) };
    };

    const showPath = (ids = [], distance = 0) => {
      const nodes = new Set(ids.map(String));
      const edges = new Set();
      for (let i = 0; i < ids.length - 1; i++) edges.add(undirKey(ids[i], ids[i+1]));
      pathRef.current = { nodes, edges, distance };
      updateSelectionStyles(); updateStatus();
    };

    apiRef.current.shortestPath = (a, b) => {
      const res = dijkstraShortestPath(a, b);
      if (!res) { flash("info", "No path found."); return; }
      showPath(res.path, res.distance);
      flash("success", `Shortest path ${a} → ${b}\nNodes: ${res.path.join(" → ")}\nTotal weight: ${res.distance}`);
    };

    apiRef.current.clearPath = () => {
      pathRef.current = { nodes: new Set(), edges: new Set(), distance: 0 };
      updateSelectionStyles(); updateStatus(); flash("info", "Path cleared");
    };

    apiRef.current.gotoVersion = vid => {
      if (!vid && vid !== 0) return flash("error", "Wrong version number.");
      const idNum = Number(String(vid).trim());
      if (!idNum || Number.isNaN(idNum)) return flash("error", "Wrong version number.");
      const v = versionsRef.current.find(x => x.vid === idNum);
      if (!v) return flash("error", `Can't find version #${idNum}.`);
      pushHistory(); redoStackRef.current = []; restore(v.state);
      setUiTick(t => t + 1); apiRef.current.listNodes(); flash("success", `Restored version #${idNum}`);
    };

    apiRef.current.listVersions = () => {
      if (versionsRef.current.length === 0) return flash("info", "No versions yet - create them by adding/removing nodes/edges");
      const lines = versionsRef.current.map(v => {
        const ts = new Date(v.at).toLocaleString();
        const extra = v.event === "add_node" ? `id=${v.payload.id}, label=${v.payload.label}`
          : v.event === "remove_node" ? `id=${v.payload.id}`
          : `source=${v.payload.source}, target=${v.payload.target}`;
        const n = v.state.nodes.length; const m = v.state.links.length;
        return `#${v.vid}  [${ts}]  ${v.event}  (${extra})  —  ${n} nodes, ${m} edges`;
      }).join("\n");
      openModal({
        title: "Versions",
        fields: [{ name: "txt", label: "Log", type: "textarea", rows: 10, defaultValue: lines }],
        confirmText: "Close",
        cancelText: "Close",
        onSubmit: closeModal, onClose: closeModal
      });
    };

    apiRef.current.saveVersion = name => {
      const nm = String(name ?? "").trim();
      if (!nm) return flash("info", "Name the version.");
      const v = { id: savedNextIdRef.current++, name: nm, at: new Date().toISOString(), state: snapshot() };
      savedVersionsRef.current.push(v);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(savedVersionsRef.current)); } catch {}
      flash("success", `Saved version #${v.id} "${v.name}"`);
    };

    apiRef.current.listSavedVersions = () => {
      if (savedVersionsRef.current.length === 0) return flash("info", "No saved versions");
      const lines = savedVersionsRef.current.map(v => {
        const ts = new Date(v.at).toLocaleString();
        return `#${v.id} "${v.name}"  [${ts}]  —  ${v.state.nodes.length} nodes, ${v.state.links.length} edges`;
      }).join("\n");
      openModal({
        title: "Saved versions",
        fields: [{ name: "txt", label: "Saved", type: "textarea", rows: 10, defaultValue: lines }],
        confirmText: "Close", cancelText: "Close", onSubmit: closeModal, onClose: closeModal
      });
    };

    apiRef.current.gotoSavedVersion = idOrName => {
      const raw = String(idOrName ?? "").trim();
      if (!raw) return;
      let v = savedVersionsRef.current.find(x => String(x.id) === raw) ||
              savedVersionsRef.current.find(x => x.name.toLowerCase() === raw.toLowerCase());
      if (!v) return flash("error", `No saved version: ${raw}`);
      pushHistory(); redoStackRef.current = []; restore(v.state);
      setUiTick(t => t + 1); apiRef.current.listNodes();
      flash("success", `Restored saved version "${v.name}"`);
    };

    const controller = new AbortController();
    d3.json("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/data_network.json", { signal: controller.signal })
      .then(data => {
        if (!data) return;
        const addUnique = (arr, v) => (arr.includes(v) ? arr : [...arr, v]);
        const fetchedNodes = data.nodes.map(d => ({ ...d, label: d.name ?? d.id, role: "", targets: [], sources: [] }));
        const fetchedLinks = data.links.map(d => ({ ...d, weight: 1 }));
        nodesRef.current = nodesRef.current.concat(fetchedNodes);
        linksRef.current = linksRef.current.concat(fetchedLinks);
        const byId = new Map(nodesRef.current.map(n => [String(n.id), n]));
        fetchedLinks.forEach(l => {
          const s = typeof l.source === "object" ? l.source.id : l.source;
          const t = typeof l.target === "object" ? l.target.id : l.target;
          const sn = byId.get(String(s)); const tn = byId.get(String(t));
          if (sn && tn) { sn.targets = addUnique(sn.targets ?? [], String(t)); tn.sources = addUnique(tn.sources ?? [], String(s)); }
        });
        while (nodesRef.current.some(n => String(n.id) === `new${nextIdRef.current}`)) nextIdRef.current += 1;
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          const arr = raw ? JSON.parse(raw) : [];
          savedVersionsRef.current = Array.isArray(arr) ? arr : [];
          const maxId = savedVersionsRef.current.reduce((m, v) => Math.max(m, v.id || 0), 0);
          savedNextIdRef.current = maxId + 1;
        } catch {}
        apiRef.current.refreshGraph(); apiRef.current.listNodes();
      })
      .catch(err => { if (err.name !== "AbortError") console.error("D3 json error:", err); });

    const onResize = () => {
      const s = getSize();
      innerW = s.innerW; innerH = s.innerH;
      bg.attr("width", s.w).attr("height", s.h);
      if (simRef.current) {
        simRef.current.force("center", d3.forceCenter(innerW / 2, innerH / 2));
        if (layoutModeRef.current === "force") simRef.current.alpha(0.2).restart();
      }
      updateStatus();
    };
    window.addEventListener("resize", onResize);
    onResize();

    return () => {
      if (simRef.current) simRef.current.stop();
      controller.abort();
      window.removeEventListener("resize", onResize);
      root.selectAll("*").remove();
    };
  }, []);

  const handleAddNode = () => {
    openModal({
      title: "Add node",
      fields: [{ name: "label", label: "Name / label", placeholder: "e.g. New node" }],
      confirmText: "Add",
      onSubmit: ({ label }) => { closeModal(); apiRef.current.addNode(label); },
      onClose: closeModal
    });
  };

  const handleAddLink = () => {
    const nodeIds = nodesRef.current.map(n => String(n.id));
    const nodeLabels = nodesRef.current.map(n => String(n.label ?? "")).filter(Boolean);
    const options = Array.from(new Set([...nodeIds, ...nodeLabels]))
      .sort((a,b)=>a.localeCompare(b, undefined, {numeric:true}));

    openModal({
      title: "Add edge",
      description: "Connect two nodes with ID or name (case-insensitive).",
      fields: [
        { name: "a", label: "Source (ID or name)",  placeholder: "e.g. n1 or Alice", datalistOptions: options },
        { name: "b", label: "Target (ID or name)",    placeholder: "e.g. n2 or Bob",   datalistOptions: options },
      ],
      confirmText: "Connect",
      onSubmit: ({ a, b }) => { closeModal(); apiRef.current.addLinkSmart(a, b); },
      onClose: closeModal
    });
  };

  const handleRemoveLink = () => {
    const nodeIds = nodesRef.current.map(n => String(n.id));
    const nodeLabels = nodesRef.current.map(n => String(n.label ?? "")).filter(Boolean);
    const options = Array.from(new Set([...nodeIds, ...nodeLabels])).sort((a,b)=>a.localeCompare(b, undefined, {numeric:true}));

    openModal({
      title: "Remove edge",
      description: "Specify two nodes with ID or name (case-insensitive).",
      fields: [
        { name: "a", label: "A (ID or name)", placeholder: "e.g. n1 or Alice", datalistOptions: options },
        { name: "b", label: "B (ID or name)", placeholder: "e.g. n2 or Bob", datalistOptions: options },
      ],
      confirmText: "Remove",
      onSubmit: ({ a, b }) => { closeModal(); apiRef.current.removeLinkSmart(a, b); },
      onClose: closeModal
    });
  };

  const handleRemoveNode = () => {
    const nodeIds = nodesRef.current.map(n => String(n.id));
    const nodeLabels = nodesRef.current.map(n => String(n.label ?? "")).filter(Boolean);
    const options = Array.from(new Set([...nodeIds, ...nodeLabels])).sort((a,b)=>a.localeCompare(b, undefined, {numeric:true}));

    openModal({
      title: "Remove node",
      fields: [{ name: "key", label: "ID or name", placeholder: "e.g. n2 or Alice", datalistOptions: options }],
      confirmText: "Remove",
      onSubmit: ({ key }) => { closeModal(); apiRef.current.removeNodeSmart(key); },
      onClose: closeModal
    });
  };

  const handleUndo = () => apiRef.current.undo();
  const handleRedo = () => apiRef.current.redo();

  const handleListVersions = () => apiRef.current.listVersions();
  const handleGotoVersion = () => {
    openModal({
      title: "Go to version",
      fields: [{ name: "vid", label: "Version #", placeholder: "e.g. 3" }],
      confirmText: "Restore",
      onSubmit: ({ vid }) => { closeModal(); apiRef.current.gotoVersion(vid); },
      onClose: closeModal
    });
  };

  const handleSaveVersion = () => {
    openModal({
      title: "Save version",
      fields: [{ name: "name", label: "Name", placeholder: "e.g. checkpoint-1" }],
      confirmText: "Save",
      onSubmit: ({ name }) => { closeModal(); apiRef.current.saveVersion(name); },
      onClose: closeModal
    });
  };

  const handleListSavedVersions = () => apiRef.current.listSavedVersions();
  const handleGotoSavedVersion = () => {
    openModal({
      title: "Get saved version",
      fields: [{ name: "key", label: "ID or name", placeholder: "e.g. 2 or checkpoint-1" }],
      confirmText: "Restore",
      onSubmit: ({ key }) => { closeModal(); apiRef.current.gotoSavedVersion(key); },
      onClose: closeModal
    });
  };

  const handleHierTB = () => {
    if (gridEnabledRef.current) { gridEnabledRef.current = false; setGridEnabled(false); apiRef.current.__setGridVisible?.(false); }
    if (simRef.current) simRef.current.on("tick", null);
    apiRef.current.layoutHierarchical("TB");
  };
  const handleHierLR = () => {
    if (gridEnabledRef.current) { gridEnabledRef.current = false; setGridEnabled(false); apiRef.current.__setGridVisible?.(false); }
    if (simRef.current) simRef.current.on("tick", null);
    apiRef.current.layoutHierarchical("LR");
  };
  const handleCircular = () => {
    if (gridEnabledRef.current) { gridEnabledRef.current = false; setGridEnabled(false); apiRef.current.__setGridVisible?.(false); }
    if (simRef.current) simRef.current.on("tick", null);
    apiRef.current.layoutCircular({ order: "id", clockwise: true });
  };
  const handleForce = () => {
    if (gridEnabledRef.current) { gridEnabledRef.current = false; setGridEnabled(false); apiRef.current.__setGridVisible?.(false); }
    apiRef.current.startForce();
  };

  const handleShortestPath = () => {
    const nodeIds = nodesRef.current.map(n => String(n.id));
    const nodeLabels = nodesRef.current.map(n => String(n.label ?? "")).filter(Boolean);
    const options = Array.from(new Set([...nodeIds, ...nodeLabels])).sort((a,b)=>a.localeCompare(b, undefined, {numeric:true}));
    openModal({
      title: "Shortest path",
      description: "Directed path, weighted by edge weight (>=0).",
      fields: [
        { name: "a", label: "From ID", placeholder: "e.g. n1", datalistOptions: options },
        { name: "b", label: "To ID", placeholder: "e.g. n7", datalistOptions: options },
      ],
      confirmText: "Find",
      onSubmit: ({ a, b }) => { closeModal(); apiRef.current.shortestPath(a, b); },
      onClose: closeModal
    });
  };
  const handleClearPath = () => apiRef.current.clearPath();

  const handleToggleGrid = () => {
    const turningOn = !gridEnabledRef.current;
    if (turningOn) {
      const s = getSize();
      const gs = gridSizeRef.current;
      const cols = Math.max(1, Math.ceil(Math.sqrt(nodesRef.current.length)));
      const rows = Math.max(1, Math.ceil(nodesRef.current.length / cols));
      const gridW = cols * gs; const gridH = rows * gs;
      const startX = Math.max(20, (s.innerW - gridW) / 2);
      const startY = Math.max(20, (s.innerH - gridH) / 2);
      nodesRef.current.forEach((n, i) => {
        const row = Math.floor(i / cols); const col = i % cols;
        n.x = startX + col * gs; n.y = startY + row * gs; n.fx = null; n.fy = null;
      });
      if (simRef.current) { simRef.current.stop(); simRef.current.on("tick", null); }
      layoutModeRef.current = "grid";
      gridEnabledRef.current = true; setGridEnabled(true);
      apiRef.current.__ensureGridPattern?.(); apiRef.current.__setGridVisible?.(true);
      apiRef.current.refreshGraph(); flash("info", `Grid ON (${gs}px)`);
    } else {
      gridEnabledRef.current = false; setGridEnabled(false);
      apiRef.current.__setGridVisible?.(false); apiRef.current.refreshGraph(); flash("info", "Grid OFF");
    }
  };

  const handleGridSize = () => {
    openModal({
      title: "Grid size",
      fields: [{ name: "px", label: "Pixels", type: "number", step: "1", defaultValue: String(gridSizeRef.current) }],
      confirmText: "Apply",
      onSubmit: ({ px }) => {
        const v = Number(px);
        if (!Number.isFinite(v) || v <= 0) { flash("error", "Please enter a positive number"); return; }
        gridSizeRef.current = v; setGridSize(v);
        if (gridEnabledRef.current) { apiRef.current.__ensureGridPattern?.(); apiRef.current.__setGridVisible?.(true); }
        closeModal(); flash("success", `Grid size set to ${v}px`);
      },
      onClose: closeModal
    });
  };

  const applyEdgeWeightChange = (a, b, val) => {
    const link = findLink(a, b);
    if (!link) return;
    const num = Number(val);
    link.weight = Number.isFinite(num) ? Math.abs(num) : 1;
    apiRef.current.refreshGraph();
    setUiTick(t => t + 1);
    flash("info", `Edge weight: ${a}—${b} = ${link.weight}`);
  };

  const handleToggleDegree = () => {
    showDegreeRef.current = !showDegreeRef.current;
    setShowDegree(showDegreeRef.current);
    if (showDegreeRef.current) computeVisibleAnalytics();
    apiRef.current.refreshGraph();
    flash("info", showDegreeRef.current ? "Degree labels ON" : "Degree labels OFF");
  };
  const handleExpandNeighbours = () => {
    if (!selectionRef.current || selectionRef.current.type !== "node") {
      flash("info", "Select a node first."); return;
    }
    computeNeighboursFor(selectionRef.current.id);
    apiRef.current.refreshGraph();
  };
  const handleClearExpansion = () => { clearExpansionState(); apiRef.current.refreshGraph(); };

  const undoDisabled = undoStackRef.current.length === 0;
  const redoDisabled = redoStackRef.current.length === 0;

  const selectedNodePageRank = () => {
    if (!selection || selection.type !== "node") return null;
    const pr = computePageRank();
    return pr.get(String(selection.id));
  };

  return (
    <div className={`app ${dark ? "dark" : ""}`}>
      <nav id="toolbar" className="navbar">
        <Toolbar
          onAddNode={handleAddNode}
          onAddLink={handleAddLink}
          onRemoveNode={handleRemoveNode}
          onRemoveLink={handleRemoveLink}
          onUndo={handleUndo}
          onRedo={handleRedo}
          undoDisabled={undoDisabled}
          redoDisabled={redoDisabled}
          onListVersions={handleListVersions}
          onGotoVersion={handleGotoVersion}
          onSaveVersion={handleSaveVersion}
          onListSavedVersions={handleListSavedVersions}
          onGotoSavedVersion={handleGotoSavedVersion}
          onTogglePan={() => apiRef.current.togglePan()}
          panEnabled={panEnabled}
          onExportJSON={expJSON}
          onExportCSV={expCSV}
          onExportGraphML={expGraphML}
          onExportPNG={expPNG}
          onImportJSON={() => jsonInputRef.current?.click()}
          onImportCSV={() => csvInputRef.current?.click()}
          onImportGraphML={() => graphmlInputRef.current?.click()}
          onHierTB={handleHierTB}
          onHierLR={handleHierLR}
          onForceLayout={handleForce}
          onCircularLayout={handleCircular}
          onShortestPath={handleShortestPath}
          onClearPath={handleClearPath}
          onToggleGrid={handleToggleGrid}
          onGridSize={handleGridSize}
          gridEnabled={gridEnabled}
          onToggleDark={() => setDark(d => !d)}
          dark={dark}
        />

        <Banner notice={notice} onDismiss={closeBanner} />

        <input
          className="search-input"
          placeholder="Search id/label/role…"
          value={filter}
          onChange={(e) => setFilterLive(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setFilterLive(""); }}
          aria-label="Filter nodes"
        />
        <span ref={statusRef} className="status" />
      </nav>

      <div className="main-row">
        <main className="canvas">
          <div ref={containerRef} id="my_dataviz" />
        </main>

        {sidebarOpen && selection && (
          <aside className="sidebar" aria-label="Property Panel">
            <div className="panel-header">
              <strong>{selection.type === "node" ? "Node Properties" : "Edge Properties"}</strong>
              <button className="btn" onClick={() => setSidebarOpen(false)}>Close</button>
            </div>
            <div className="panel-body">
              {selection.type === "node" ? (
                <>
                  <div className="panel-group">
                    <label className="panel-label">Node ID</label>
                    <input className="panel-input" value={nodeDraft?.id ?? ""} onChange={(e) => setNodeDraft(d => ({ ...(d || {}), id: e.target.value }))}/>
                  </div>
                  <div className="panel-group">
                    <label className="panel-label">Label</label>
                    <input className="panel-input" value={nodeDraft?.label ?? ""} onChange={(e) => setNodeDraft(d => ({ ...(d || {}), label: e.target.value }))}/>
                  </div>
                  <div className="panel-group">
                    <label className="panel-label">Role</label>
                    <input className="panel-input" value={nodeDraft?.role ?? ""} onChange={(e) => setNodeDraft(d => ({ ...(d || {}), role: e.target.value }))}/>
                  </div>
                  <div className="panel-group">
                    <label className="panel-label">PageRank</label>
                    <input className="panel-input panel-readonly" readOnly value={(selectedNodePageRank() ?? 0).toFixed(6)}/>
                  </div>
                  <div className="panel-group">
                    <label className="panel-label">Sources (incoming)</label>
                    <textarea className="panel-input panel-readonly" rows={3} readOnly value={(findNode(selection.id)?.sources ?? []).join(", ")}/>
                  </div>
                  <div className="panel-group">
                    <label className="panel-label">Targets (outgoing)</label>
                    <textarea className="panel-input panel-readonly" rows={3} readOnly value={(findNode(selection.id)?.targets ?? []).join(", ")}/>
                  </div>
                  <div className="panel-row">
                    <button className="btn btn-primary" onClick={commitNodeDraft}>Apply changes</button>
                    <button className="btn" onClick={handleToggleDegree}>{showDegree ? "Hide degree" : "Show degree"}</button>
                    <button className="btn" onClick={handleExpandNeighbours}>Expand neighbours</button>
                    <button className="btn" onClick={handleClearExpansion}>Clear expansion</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="panel-group">
                    <label className="panel-label">Source</label>
                    <input className="panel-input panel-readonly" value={selection.source} readOnly />
                  </div>
                  <div className="panel-group">
                    <label className="panel-label">Target</label>
                    <input className="panel-input panel-readonly" value={selection.target} readOnly />
                  </div>
                  <div className="panel-group">
                    <label className="panel-label">Weight</label>
                    <input
                      type="number" step="any" className="panel-input"
                      value={String(findLink(selection.source, selection.target)?.weight ?? 1)}
                      onChange={(e) => applyEdgeWeightChange(selection.source, selection.target, e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      <input ref={jsonInputRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => importJSONFromFile(e.target.files?.[0])}/>
      <input ref={csvInputRef} type="file" accept="text/csv,.csv" style={{ display: "none" }} onChange={(e) => importCSVFromFile(e.target.files?.[0])}/>
      <input ref={graphmlInputRef} type="file" accept=".graphml,application/xml,text/xml" style={{ display: "none" }} onChange={(e) => importGraphMLFromFile(e.target.files?.[0])}/>

      <Modal
        open={modal.open}
        title={modal.title}
        description={modal.description}
        fields={modal.fields}
        confirmText={modal.confirmText}
        cancelText={modal.cancelText}
        onSubmit={modal.onSubmit}
        onClose={modal.onClose}
      />
    </div>
  );
}
