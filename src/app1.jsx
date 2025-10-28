// src/App.jsx
import { useEffect, useRef, useState  } from "react";
import * as d3 from "d3";
import Toolbar from "./components/Toolbar"; // Mina knappar son tar callback-props

export default function App() {
  const containerRef = useRef(null);
  // // Pekar på <div> där vi placerar SVG:n som D3 ritar i.


  // Imperativt API för knapparna
  const apiRef = useRef({
    // "Imperativt API": knapparna i Toolbar anropar dessa metoder.
    // Vi fyller i riktiga funktioner inne i useEffect när D3 är initierat.
    addNode: () => {},
    addLink: () => {},
    removeNode: () => {},
    removeLink: () => {},
    undo: () => {},
    redo: () => {},
    // Event-versionslogg (behålls som tidigare)
    gotoVersion: () => {},
    listVersions: () => {},
    // ⬇️ PERSISTENTA (namngivna) versioner
    saveVersion: () => {},
    listSavedVersions: () => {},
    gotoSavedVersion: () => {},
  });

  // D3 refs
  const gRef = useRef(null);// D3 <g>-grupp i SVG
  const simRef = useRef(null);// D3-simuleringen (forceSimulation)
  const nodesRef = useRef([]);// Aktuella noder (muteras av D3/handlers)
  const linksRef = useRef([]);// Aktuella kanter


  // Räknare för unika id:n (new1, new2, ...)
  const nextIdRef = useRef(1);// Räknare för att skapa unika id:n "new1", "new2", ...

  // UNDO/REDO-historik
  const undoStackRef = useRef([]); // Historia före förändring (för Undo)
  const redoStackRef = useRef([]); // Historia för framåt (för Redo)

  // VERSIONER: eventlogg (i minnet)
  const versionsRef = useRef([]); // Eventlogg (icke-persistent)
  const versionIdRef = useRef(1);

  // ⬇️ PERSISTENTA (namngivna) versioner
  const STORAGE_KEY = "graph_saved_versions_v1";
  const savedVersionsRef = useRef([]); // Namngivna, sparade versioner i localStorage
  const savedNextIdRef = useRef(1);

  // Används bara för nuvarande statusrad (<span ref>), som vi snart byter ut mot en komponent.
  const statusRef = useRef(null);


  // Vald nod (för Delete)
  const selectedNodeIdRef = useRef(null);// vilken nod som är vald (för delete-tangent)
  const [uiTick, setUiTick] = useState(0);// tvingar om-render när vi behöver uppdatera UI

  useEffect(() => {
    // 1) Starta om alla minnesstrukturer
    nodesRef.current = [];
    linksRef.current = [];
    undoStackRef.current = [];
    redoStackRef.current = [];
    versionsRef.current = [];
    versionIdRef.current = 1;
    savedVersionsRef.current = [];
    savedNextIdRef.current = 1;
    selectedNodeIdRef.current = null;

    // 2) Skapa D3-rot: rensa, skapa SVG och en <g> för att kunna translatera marginaler
    const root = d3.select(containerRef.current);
    root.selectAll("*").remove();

    const margin = { top: 10, right: 30, bottom: 30, left: 40 };
    const svg = root.append("svg").attr("width", "100%").attr("height", "100%");
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    gRef.current = g;

    // 3) Klick på bakgrunden avmarkerar vald nod
    svg.on("click", () => {
      selectedNodeIdRef.current = null;
      updateSelectionStyles();// uppdatera highlight på noder
    });

    // 4) Beräkna storlek (innerW/innerH)
    const getSize = () => {
      const el = containerRef.current;
      const w = el?.clientWidth || window.innerWidth;
      const h = el?.clientHeight || window.innerHeight;
      return {
        w,
        h,
        innerW: Math.max(1, w - margin.left - margin.right),
        innerH: Math.max(1, h - margin.top - margin.bottom),
      };
    };
    let { innerW, innerH } = getSize();

    // 5) Skapa D3-simuleringen (krafter: länkar, laddning, centrering, dämpning)
    simRef.current = d3
      .forceSimulation()
      .force("link", d3.forceLink().id((d) => d.id))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(innerW / 2, innerH / 2))
      .velocityDecay(0.8);

    // 6) Drag-beteende för noder
    const makeDrag = () =>
      d3
        .drag()
        .on("start", (event, d) => {
          if (!event.active) simRef.current.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simRef.current.alphaTarget(0);
          d.fx = null;
          d.fy = null;// "släpper" noden efter drag
        });

    // 7) Små hjälpare för id-jämförelser och käll/target-id
    const idEq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
    const getId = (v) => (typeof v === "object" ? v?.id : v);

    // 8) (Tillfällig) statusuppdatering — skriver text direkt i <span> via ref
    const updateStatus = () => {
      if (!statusRef.current) return;
      const n = nodesRef.current.length;
      const m = linksRef.current.length;
      statusRef.current.textContent = `Nodes: ${n} · Edges: ${m}`;
    };

    // Enable/disable på Ångra/Gör om

    // 9) Highlight av vald nod – sätter stroke runt vald cirkel  
    const updateSelectionStyles = () => {
      const g = gRef.current;
      g.selectAll("g.node")
        .select("circle")
        .attr("stroke", (d) => (d.id === selectedNodeIdRef.current ? "#333" : "none"))
        .attr("stroke-width", (d) => (d.id === selectedNodeIdRef.current ? 3 : 0));
    };

    // 10) Rita/uppdatera hela grafen (kallas efter varje förändring)
    const updateGraph = () => {
      const g = gRef.current;
      const drag = makeDrag();

      // --- Länkar JOIN (D3 data-join med nyckel source-target)
      const linkKey = (d) => {
        const s = typeof d.source === "object" ? d.source.id : d.source;
        const t = typeof d.target === "object" ? d.target.id : d.target;
        return `${s}-${t}`;
      };

      let linkSel = g.selectAll("line.link").data(linksRef.current, linkKey);
      linkSel.exit().remove();
      const linkEnter = linkSel.enter().append("line").attr("class", "link").attr("stroke", "#aaa");
      linkSel = linkEnter.merge(linkSel);

       // --- Noder JOIN
      let nodeSel = g.selectAll("g.node").data(nodesRef.current, (d) => d.id);
      nodeSel.exit().remove();

      const nodeEnter = nodeSel.enter().append("g").attr("class", "node").call(drag);
      nodeEnter
        .append("circle")
        .attr("r", 8)
        .attr("fill", "#69b3a2")
        .on("click", (event, d) => {
          event.stopPropagation(); // annars triggas bakgrundsklick
          selectedNodeIdRef.current = d.id;// markera vald nod
          updateSelectionStyles();
        });

      nodeEnter
        .append("text")
        .text((d) => d.label)
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("pointer-events", "none")
        .style("font-size", "12px")
        .style("font-family", "system-ui, -apple-system, Segoe UI, Roboto, Arial")
        .style("paint-order", "stroke")
        .style("stroke", "#69b3a2")
        .style("stroke-width", 3);

      nodeSel = nodeEnter.merge(nodeSel);

      // Initial highlight-uppdatering
      updateSelectionStyles();
       // --- koppla data till simuleringen och uppdatera koordinater varje ”tick”
      // Koppla data till simuleringen
      simRef.current.nodes(nodesRef.current);
      simRef.current.force("link").links(linksRef.current);

      simRef.current.on("tick", () => {
        linkSel
          .attr("x1", (d) => (typeof d.source === "object" ? d.source.x : d.source?.x))
          .attr("y1", (d) => (typeof d.source === "object" ? d.source.y : d.source?.y))
          .attr("x2", (d) => (typeof d.target === "object" ? d.target.x : d.target?.x))
          .attr("y2", (d) => (typeof d.target === "object" ? d.target.y : d.target?.y));

        nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
      });

      simRef.current.alpha(0.6).restart();

      // UI-status
      updateStatus();// uppdatera statusraden (nuvarande lösning via ref)
    };

    // ===== UNDO/REDO + VERSIONING-hjälpare =====
    // 11) Snapshot/restore för Undo/Redo
    const snapshot = () => {
      const snapLinks = linksRef.current.map((l) => ({
        source: getId(l.source),
        target: getId(l.target),
      }));
      const snapNodes = nodesRef.current.map((n) => ({
        id: n.id,
        label: n.label,
        x: n.x,
        y: n.y,
      }));
      return { nodes: snapNodes, links: snapLinks };
    };

    const restore = (snap) => {
      nodesRef.current = snap.nodes.map((n) => ({ ...n }));
      linksRef.current = snap.links.map((l) => ({ ...l }));
      // Avmarkera ev. tidigare vald nod om den inte finns
      if (!nodesRef.current.some((n) => n.id === selectedNodeIdRef.current)) {
        selectedNodeIdRef.current = null;
      }
      updateGraph();
    };

    const pushHistory = () => {
      undoStackRef.current.push(snapshot());
      if (undoStackRef.current.length > 200) undoStackRef.current.shift();
      setUiTick(t => t + 1);// trigga om-render (så knapparnas disabled uppdateras)
    };

    const recordVersion = (event, payload = {}) => {
      versionsRef.current.push({
        vid: versionIdRef.current++,
        at: new Date().toISOString(),
        event,
        payload,
        state: snapshot(), // läget EFTER eventet
      });
    };

    // ⬇️ PERSISTENS: spara/läsa namngivna versioner
    // 12) localStorage-hantering för namngivna versioner
    const loadSavedVersions = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        savedVersionsRef.current = Array.isArray(arr) ? arr : [];
        const maxId = savedVersionsRef.current.reduce((m, v) => Math.max(m, v.id || 0), 0);
        savedNextIdRef.current = maxId + 1;
      } catch {
        savedVersionsRef.current = [];
        savedNextIdRef.current = 1;
      }
    };

    const persistSavedVersions = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedVersionsRef.current));
      } catch {
        // ignore
      }
    };

    // ===== API =====
    // 13) Fyll i API-funktionerna som Toolbar använder
    apiRef.current.addNode = (label) => {
      const name = String(label ?? "").trim();
      if (!name) return;

      pushHistory();// spara före ändring
      redoStackRef.current = [];// efter en ny ändring nollas redo

      // skapa unikt id och ungefärlig startposition
      let id;
      do {
        id = `new${nextIdRef.current++}`;
      } while (nodesRef.current.some((n) => String(n.id) === id));

      // Startposition nära mitten
      const cx = innerW / 2 + (Math.random() - 0.5) * 50;
      const cy = innerH / 2 + (Math.random() - 0.5) * 50;

      nodesRef.current.push({ id, label: name, x: cx, y: cy });
      updateGraph();

      recordVersion("add_node", { id, label: name });
    };

    apiRef.current.addLink = (sourceId, targetId) => {
      const sId = String(sourceId ?? "").trim();// validering: ids, finns noderna, ej self-link, ej dublett
      const tId = String(targetId ?? "").trim();// pushHistory(); redoStackRef = []; lägg till länken; updateGraph(); recordVersion(...)
      if (!sId || !tId) return;

      const sNode = nodesRef.current.find((n) => idEq(n.id, sId));
      const tNode = nodesRef.current.find((n) => idEq(n.id, tId));

      if (!sNode || !tNode) {
        alert("Can't find one of the nodes or either of them. Type the right ID(ex: n1,n2)");
        return;
      }
      if (idEq(sNode.id, tNode.id)) {
        alert("Can't connect the node to itself");
        return;
      }

      const exists = linksRef.current.some((l) => {
        const sid = getId(l.source);
        const tid = getId(l.target);
        return (
          (idEq(sid, sNode.id) && idEq(tid, tNode.id)) ||
          (idEq(sid, tNode.id) && idEq(tid, sNode.id))
        );
      });
      if (exists) {
        alert("This edge already exists.");
        return;
      }

      pushHistory();
      redoStackRef.current = [];

      linksRef.current.push({ source: sNode.id, target: tNode.id });
      updateGraph();

      recordVersion("add_link", { source: sNode.id, target: tNode.id });
    };

    apiRef.current.removeNode = (nodeId) => {
      // kolla att noden finns, pushHistory(); ta bort nod + alla kanter till den; updateGraph(); recordVersion(...)
      const id = String(nodeId ?? "").trim();
      if (!id) return;

      const exists = nodesRef.current.some((n) => idEq(n.id, id));
      if (!exists) {
        alert(`There is no node with this "${id}".`);
        return;
      }

      pushHistory();
      redoStackRef.current = [];

      nodesRef.current = nodesRef.current.filter((n) => !idEq(n.id, id));
      linksRef.current = linksRef.current.filter((l) => {
        const sid = getId(l.source);
        const tid = getId(l.target);
        return !idEq(sid, id) && !idEq(tid, id);
      });

      // Om vi tog bort vald nod → avmarkera
      if (selectedNodeIdRef.current === id) selectedNodeIdRef.current = null;

      updateGraph();

      recordVersion("remove_node", { id });
    };

    apiRef.current.removeLink = (sourceId, targetId) => {
      // kolla att kanten finns, pushHistory(); ta bort kanten; updateGraph(); recordVersion(...)
      const sId = String(sourceId ?? "").trim();
      const tId = String(targetId ?? "").trim();
      if (!sId || !tId) return;

      const anyMatch = linksRef.current.some((l) => {
        const sid = getId(l.source);
        const tid = getId(l.target);
        return (
          (idEq(sid, sId) && idEq(tid, tId)) ||
          (idEq(sid, tId) && idEq(tid, sId))
        );
      });
      if (!anyMatch) {
        alert(`There is no edge between "${sId}" and "${tId}".`);
        return;
      }

      pushHistory();
      redoStackRef.current = [];

      linksRef.current = linksRef.current.filter((l) => {
        const sid = getId(l.source);
        const tid = getId(l.target);
        const match =
          (idEq(sid, sId) && idEq(tid, tId)) ||
          (idEq(sid, tId) && idEq(tid, sId));
        return !match;
      });

      updateGraph();

      recordVersion("remove_link", { source: sId, target: tId });
    };

    // UNDO/REDO API
    apiRef.current.undo = () => {
       // pop från undoStack -> restore, och push nuvarande till redoStack
      if (undoStackRef.current.length === 0) {
        alert("Nothing to undo");
        return;
      }
      const currentSnap = snapshot();
      const prev = undoStackRef.current.pop();
      redoStackRef.current.push(currentSnap);
      restore(prev);
      setUiTick(t => t + 1);
    };

    apiRef.current.redo = () => {
      // pop från redoStack -> restore, och push nuvarande till undoStack
      if (redoStackRef.current.length === 0) {
        alert("Nothing to redo");
        return;
      }
      const currentSnap = snapshot();
      const next = redoStackRef.current.pop();
      undoStackRef.current.push(currentSnap);
      restore(next);
      setUiTick(t => t + 1);
    };

    // VERSIONING API (eventlogg, oförändrat)
    apiRef.current.gotoVersion = (vid) => {
      // hitta version i versionsRef, pushHistory(); restore; setUiTick(...)
      const idNum = Number(String(vid).trim());
      if (!idNum || Number.isNaN(idNum)) {
        alert("Wrong version number.");
        return;
      }
      const v = versionsRef.current.find((x) => x.vid === idNum);
      if (!v) {
        alert(`Can't find this version #${idNum}.`);
        return;
      }
      pushHistory();
      redoStackRef.current = [];
      restore(v.state);
      setUiTick(t => t + 1);
    };

    apiRef.current.listVersions = () => {
      // alert med lista (enkel debug-UI)
      if (versionsRef.current.length === 0) {
        alert("No versions yet - create them by adding/removing nodes/edges");
        return;
      }
      const lines = versionsRef.current.map((v) => {
        const ts = new Date(v.at).toLocaleString();
        const extra =
          v.event === "add_node"
            ? `id=${v.payload.id}, label=${v.payload.label}`
            : v.event === "remove_node"
            ? `id=${v.payload.id}`
            : `source=${v.payload.source}, target=${v.payload.target}`;
        const n = v.state.nodes.length;
        const m = v.state.links.length;
        return `#${v.vid}  [${ts}]  ${v.event}  (${extra})  —  ${n} noder, ${m} kanter`;
      });
      window.alert(lines.join("\n"));
    };

    // ⬇️ NAMNGIVNA, PERSISTENTA VERSIONER (Sprint1-krav)
    apiRef.current.saveVersion = (name) => {
      // spara snapshot i savedVersionsRef + localStorage
      const nm = String(name ?? "").trim();
      if (!nm) return alert("What is the name of the version?");
      const v = {
        id: savedNextIdRef.current++,
        name: nm,
        at: new Date().toISOString(),
        state: snapshot(),
      };
      savedVersionsRef.current.push(v);
      persistSavedVersions();
      alert(`Saved versions #${v.id} "${v.name}".`);
    };

    apiRef.current.listSavedVersions = () => {/* alert med lista */
      if (savedVersionsRef.current.length === 0) {
        alert("There is no saved versions");
        return;
      }
      const lines = savedVersionsRef.current.map((v) => {
        const ts = new Date(v.at).toLocaleString();
        const n = v.state.nodes.length;
        const m = v.state.links.length;
        return `#${v.id} "${v.name}"  [${ts}]  —  ${n} nodes, ${m} edges`;
      });
      window.alert(lines.join("\n"));
    };

    apiRef.current.gotoSavedVersion = (idOrName) => {
      // hitta sparad version, pushHistory(); restore; setUiTick(...)
      const raw = String(idOrName ?? "").trim();
      if (!raw) return;
      let v =
        savedVersionsRef.current.find((x) => String(x.id) === raw) ||
        savedVersionsRef.current.find((x) => x.name.toLowerCase() === raw.toLowerCase());
      if (!v) {
        alert(`There is no saved version with this id: ${raw}`);
        return;
      }
      pushHistory();
      redoStackRef.current = [];
      restore(v.state);
      setUiTick(t => t + 1);
    };

    // ===== Ladda initialdata =====
    // 14) Ladda initialdata (exempeldata via HTTP) och rita
    const controller = new AbortController();
    d3.json(
      "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/data_network.json",
      { signal: controller.signal }
    )
      .then((data) => {
        if (!data) return;

        const fetchedNodes = data.nodes.map((d) => ({
          ...d,
          label: d.name ?? d.id,
        }));
        const fetchedLinks = data.links.map((d) => ({ ...d }));

        nodesRef.current = nodesRef.current.concat(fetchedNodes);
        linksRef.current = linksRef.current.concat(fetchedLinks);

        // se till att nextIdRef inte krockar
        while (nodesRef.current.some((n) => String(n.id) === `new${nextIdRef.current}`)) {
          nextIdRef.current += 1;
        }

        // Ladda sparade versioner från localStorage
        loadSavedVersions();

        updateGraph();
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error("D3 json error:", err);
      });

    // Resize-center
    // 15) Hantera fönster-resize (uppdatera centerkraft + statusrad)
    const onResize = () => {
      const s = getSize();
      innerW = s.innerW;
      innerH = s.innerH;
      if (simRef.current) {
        simRef.current.force("center", d3.forceCenter(innerW / 2, innerH / 2));
        simRef.current.alpha(0.2).restart();
      }
      updateStatus();
    };
    window.addEventListener("resize", onResize);
    onResize();

    // Initknappar

    // Cleanup
    // 16) Cleanup när komponenten tas bort
    return () => {
      if (simRef.current) simRef.current.stop();
      controller.abort();
      window.removeEventListener("resize", onResize);
      root.selectAll("*").remove();
    };
  }, []);

  // === Knappar ===
  const handleAddNode = () => {
    const name = window.prompt("Name of the new node ?");
    if (name == null) return;// avbröt
    apiRef.current.addNode(name);// anropa ”imperativt API”
  };

  const handleAddLink = () => {
    // Gör en prompt med lista på noder, läs två ID:n, anropa apiRef.current.addLink(a, b)
    const list = nodesRef.current
      .map((n, i) => `${i + 1}) [${String(n.id)}] ${String(n.label)}`)
      .join("\n");

    const ans = window.prompt(
      "Connect two nodes (By ID).\n" +
        "Write two different IDs separated with comma Ex: n1,n2 \n\n" +
        "Available nodes:\n" +
        list
    );
    if (!ans) return;
    const [a, b] = ans.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!a || !b) return;
    apiRef.current.addLink(a, b);
  };

  const handleRemoveNode = () => {
    /* prompt, apiRef.current.removeNode(...) */
    const list = nodesRef.current
      .map((n, i) => `${i + 1}) [${String(n.id)}] ${String(n.label)}`)
      .join("\n");
    const id = window.prompt(
      "Remove node (by ID).\n" +
        "Write nodes ID ,Ex: n2.\n\n" +
        "Available nodes to remove:\n" +
        list
    );
    if (id == null) return;
    apiRef.current.removeNode(id);
  };

  const handleRemoveLink = () => {
    /* prompt, apiRef.current.removeLink(...) */
    const idToLabel = new Map(
      nodesRef.current.map((n) => [String(n.id), String(n.label)])
    );

    const uniq = new Map();
    linksRef.current.forEach((l) => {
      const sid = String(typeof l.source === "object" ? l.source?.id : l.source);
      const tid = String(typeof l.target === "object" ? l.target?.id : l.target);
      const [a, b] = [sid, tid].sort((x, y) => x.localeCompare(y));
      const labelA = idToLabel.get(a) ?? a;
      const labelB = idToLabel.get(b) ?? b;
      const key = `${a}|${b}`;
      uniq.set(key, `[${a}] ${labelA} — [${b}] ${labelB}`);
    });

    const list = Array.from(uniq.values()).join("\n") || "(Inga kanter ännu)";

    const ans = window.prompt(
      "Remove Edge (by ID)\n" +
        "Write two different IDs separated with comma Ex: n1,n2\n\n" +
        "Available edges to remove:\n" +
        list
    );

    if (!ans) return;
    const [a, b] = ans
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!a || !b) return;
    apiRef.current.removeLink(a, b);
  };

  const handleUndo = () => apiRef.current.undo();
  const handleRedo = () => apiRef.current.redo();

  // Version UI (eventlogg)
  const handleListVersions = () => apiRef.current.listVersions();
  const handleGotoVersion = () => {
    /* prompt nummer -> apiRef.current.gotoVersion */
    const ans = window.prompt("Enter the version number (#) to restore to.\n(Tip: click 'Show versions' first.)");
    if (!ans) return;
    apiRef.current.gotoVersion(ans);
  };

  // ⬇️ NAMNGIVNA versioner (persistenta)
  const handleSaveVersion = () => {
    /* prompt namn -> apiRef.current.saveVersion */
    const nm = window.prompt("Enter a name for this version (e.g., 'v1 - base graph'):");
    if (nm == null) return;
    apiRef.current.saveVersion(nm);
  };
  const handleListSavedVersions = () => apiRef.current.listSavedVersions(); 
  const handleGotoSavedVersion = () => {
    /* prompt id/namn -> apiRef.current.gotoSavedVersion */ 
    const raw = window.prompt("Enter the version ID or name to restore (e.g., 3 or 'v1 - base graph')");
    if (!raw) return;
    apiRef.current.gotoSavedVersion(raw);
  };

  // === Tangentbordsgenvägar: Ctrl+Z / Ctrl+Y (+ Cmd-Z / Cmd-Shift-Z) + N/Delete ===
  useEffect(() => {
      // Lyssnar på keydown: Ctrl/Cmd+Z (undo), Ctrl+Y / Cmd+Shift+Z (redo), N (ny nod), Y (ny länk), Delete (ta bort vald nod)
  // Viktigt: om fokus ligger i ett input/textarea – gör inget (låter standard-undo gälla där).
  // returnerar en cleanup som tar bort eventlyssnaren.
    const isEditable = (el) =>
      el &&
      (el.closest("input, textarea, select") ||
        el.isContentEditable ||
        el.closest("[contenteditable='true']"));

    const onKeyDown = (e) => {
      const key = e.key.toLowerCase();
      const target = e.target;
      if (isEditable(target)) return; // låt inputs behålla sin egen undo/redo m.m.

      const ctrl = e.ctrlKey;
      const meta = e.metaKey; // Cmd på Mac

      // Undo
      if ((ctrl && key === "z") || (meta && !e.shiftKey && key === "z")) {
        e.preventDefault();
        apiRef.current.undo();
        return;
      }
      // Redo
      if ((ctrl && key === "y") || (meta && e.shiftKey && key === "z")) {
        e.preventDefault();
        apiRef.current.redo();
        return;
      }
      // Ny nod (N)
      if (!ctrl && !meta && key === "n") {
        e.preventDefault();
        const name = window.prompt("Name of the new node ?");
        if (name != null) apiRef.current.addNode(name);
        return;
      }
      // NY kant (Y)
      if (!ctrl && !meta && key === "y") {
        e.preventDefault();

        const list = nodesRef.current
          .map((n, i) => `${i + 1}) [${String(n.id)}] ${String(n.label)}`)
          .join("\n");

        const ans = window.prompt(
          "Connect two nodes (by ID).\n" +
            "Write two IDs separated by comma (e.g. n1,n2)\n\n" +
            "Available nodes:\n" + list
        );
        if (ans == null) return; // user pressed Cancel

        const [a, b] = ans.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
        if (!a || !b) return;

        apiRef.current.addLink(a, b); // valideringen sker i addLink
        return;
      }

      
      // Ta bort vald nod (Delete/Backspace)
      if (!ctrl && !meta && (key === "delete" || key === "backspace")) {
        const id = selectedNodeIdRef.current;
        if (id) {
          e.preventDefault();
          apiRef.current.removeNode(id);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const undoDisabled = undoStackRef.current.length === 0;
  const redoDisabled = redoStackRef.current.length === 0;
  return (
    <>
      <div ref={containerRef} id="my_dataviz" />
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
        />
        
      {/* Statusrad */}
      <span ref={statusRef} style={{ marginLeft: 12, opacity: 0.8 }} />
    </>
  );
}
/*4) Varför apiRef?

React ”tänker” deklarativt, D3 är imperativt (”gör så här på den här DOM:en nu”).

apiRef ger dig ett litet kommando-API som knapparna kan anropa, utan att behöva bry sig om D3:s inre detaljer.

Exempel: handleAddNode → apiRef.current.addNode('Alice') → lägger till i nodesRef → updateGraph() ritar om.

5) Undo/Redo (enkelt mentalt modell)

Före du ändrar något: pushHistory() sparar en kopia (snapshot) av läget → undoStack.

När du ångrar:

ta senaste från undoStack och återställ (restore),

lägg det du hade nyss på redoStack (så du kan ”göra om”).

När du gör en ny ändring (ex: add node) tömmer du redoStack (standardbeteende i editors).

6) Statusraden (förslag för ”React-way”)

Just nu skriver updateStatus() direkt in text till <span ref={statusRef}>. Ett mer ”Reactigt” sätt är att skicka siffrorna som props till en liten StatusBar-komponent, och rendera texten via JSX (då slipper du refs + manuell DOM-uppdatering). Du har redan uiTick som triggar re-render; då räcker det att använda:

nodesRef.current.length och

linksRef.current.length

i props.


7) Summering

React: struktur, knappar, props, små bitar UI.

D3: all grafik och layout, körs inuti useEffect.

Refs: för D3-objekt och data som inte ska trigga om-render vid varje mutation.

State (uiTick): bara för att säga till React: ”rendera om nu”.

apiRef: ett litet kommandobibliotek som knapparna anropar.

Undo/Redo: två stackar med snapshots.

Versioner: eventlogg (minne) + namngivna sparade versioner (localStorage).

Säg gärna vilken del som känns mest dimmig nu (t.ex. updateGraph, dragbeteendet, eller snapshots), så zoomar vi in ytterligare och skriver mini-kommentarer just där

så sammanfattningsvis första omvandlar man data till text sen skapar en nedbär fil som man kan ladda ned och det är blob funktion som gör det och skapa länk efter det url sen man städar man minnet med revokeObjectURL
.*/
