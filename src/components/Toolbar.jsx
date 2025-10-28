import { useEffect, useRef, useState } from "react";

function IconUndo(props) {
    return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...props}>
            <path d="M7 7H3v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 7a9 9 0 1 1-2 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
function IconRedo(props) {
    return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...props}>
            <path d="M17 7h4v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 7a9 9 0 1 0 2 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
function IconHand(props) {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden {...props}>
            <path d="M7 11V6a1 1 0 1 1 2 0v3M9 6a1 1 0 1 1 2 0v3M11 6a1 1 0 1 1 2 0v4M13 7a1 1 0 1 1 2 0v5M15 8a1 1 0 1 1 2 0v6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M7 11c-1.5 0-2 .5-2 2 0 4 3 7 7 7s7-3 7-7v-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}
function ChevronDown(props) {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden {...props}>
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export default function Toolbar({
    onAddNode, onAddLink, onRemoveNode, onRemoveLink,
    onUndo, onRedo, undoDisabled, redoDisabled,
    onListVersions, onListSavedVersions, onGotoSavedVersion,
    onGotoVersion, onSaveVersion, onTogglePan, panEnabled,
    onExportJSON, onExportCSV, onExportGraphML, onExportPNG,
    onImportJSON, onImportCSV, onImportGraphML,
    onHierTB, onHierLR, onForceLayout, onCircularLayout,
    onClearPath, onShortestPath, onToggleGrid, onGridSize, gridEnabled,
    onToggleDark, dark
}) {
    // open only one dropdown at a time
    const [open, setOpen] = useState(null); // 'nodes' | 'edges' | 'layout' | 'export' | 'import' | 'versions' | null
    const rootRef = useRef(null);

    const toggle = (key) => setOpen(cur => (cur === key ? null : key));
    const closeAll = () => setOpen(null);

    useEffect(() => {
        const onDocClick = (e) => {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(e.target)) closeAll();
        };
        document.addEventListener("click", onDocClick);
        return () => document.removeEventListener("click", onDocClick);
    }, []);

    return (
        <div ref={rootRef} className="toolbar">
            {/* OUTER quick actions */}
            <button className="icon-btn hover-red" onClick={onUndo} disabled={undoDisabled} title="Undo">
                <IconUndo /><span className="sr-only">Undo</span>
            </button>
            <button className="icon-btn hover-red" onClick={onRedo} disabled={redoDisabled} title="Redo">
                <IconRedo /><span className="sr-only">Redo</span>
            </button>

            <div className="v-sep" />

            <button className="chip-btn hover-red" onClick={onTogglePan} title="Toggle pan mode (scroll to zoom)">
                <IconHand />&nbsp;{panEnabled ? "Pan: ON" : "Pan: OFF"}
            </button>

            <div className="v-sep" />

            {/* NODES */}
            <div className={`dd ${open === "nodes" ? "open" : ""}`}>
                <button className="dd-btn hover-red" onClick={() => toggle("nodes")}>Nodes <ChevronDown /></button>
                {open === "nodes" && (
                    <div className="dd-menu">
                        <button className="hover-red" onClick={() => { closeAll(); onAddNode(); }}>Add node</button>
                        <button className="hover-red" onClick={() => { closeAll(); onRemoveNode(); }}>Remove node</button>
                    </div>
                )}
            </div>

            {/* EDGES */}
            <div className={`dd ${open === "edges" ? "open" : ""}`}>
                <button className="dd-btn hover-red" onClick={() => toggle("edges")}>Edges <ChevronDown /></button>
                {open === "edges" && (
                    <div className="dd-menu">
                        <button className="hover-red" onClick={() => { closeAll(); onAddLink(); }}>Add edge</button>
                        <button className="hover-red" onClick={() => { closeAll(); onRemoveLink(); }}>Remove edge</button>
                    </div>
                )}
            </div>

            {/* LAYOUT */}
            <div className={`dd ${open === "layout" ? "open" : ""}`}>
                <button className="dd-btn hover-red" onClick={() => toggle("layout")}>Layout <ChevronDown /></button>
                {open === "layout" && (
                    <div className="dd-menu">
                        <div className="dd-label">Layouts</div>
                        <button className="hover-red" onClick={() => { closeAll(); onHierTB(); }} title="Top-to-Bottom">Hier TB</button>
                        <button className="hover-red" onClick={() => { closeAll(); onHierLR(); }} title="Left-to-Right">Hier LR</button>
                        <button className="hover-red" onClick={() => { closeAll(); onForceLayout(); }}>Force</button>
                        <button className="hover-red" onClick={() => { closeAll(); onCircularLayout(); }}>Circular</button>
                        <hr />
                        <div className="dd-label">Paths</div>
                        <button className="hover-red" onClick={() => { closeAll(); onShortestPath(); }}>Shortest path</button>
                        <button className="hover-red" onClick={() => { closeAll(); onClearPath(); }}>Clear path</button>
                        <hr />
                        <div className="dd-label">Grid</div>
                        <button
                            className="hover-red"
                            onClick={() => { closeAll(); onToggleGrid(); }}
                            onContextMenu={(e) => { e.preventDefault(); onGridSize && onGridSize(); }}
                            title="Right-click to change grid size"
                        >
                            {gridEnabled ? "Grid: ON" : "Grid: OFF"}
                        </button>
                    </div>
                )}
            </div>

            {/* EXPORT */}
            <div className={`dd ${open === "export" ? "open" : ""}`}>
                <button className="dd-btn hover-red" onClick={() => toggle("export")}>Export <ChevronDown /></button>
                {open === "export" && (
                    <div className="dd-menu">
                        <button className="hover-red" onClick={() => { closeAll(); onExportJSON(); }}>Export JSON</button>
                        <button className="hover-red" onClick={() => { closeAll(); onExportPNG(); }}>Export PNG</button>
                        <button className="hover-red" onClick={() => { closeAll(); onExportCSV(); }}>Export CSV</button>
                        <button className="hover-red" onClick={() => { closeAll(); onExportGraphML(); }}>Export GraphML</button>
                    </div>
                )}
            </div>

            {/* IMPORT */}
            <div className={`dd ${open === "import" ? "open" : ""}`}>
                <button className="dd-btn hover-red" onClick={() => toggle("import")}>Import <ChevronDown /></button>
                {open === "import" && (
                    <div className="dd-menu">
                        <button className="hover-red" onClick={() => { closeAll(); onImportJSON(); }}>Import JSON</button>
                        <button className="hover-red" onClick={() => { closeAll(); onImportCSV(); }}>Import CSV</button>
                        <button className="hover-red" onClick={() => { closeAll(); onImportGraphML(); }}>Import GraphML</button>
                    </div>
                )}
            </div>

            {/* VERSIONS */}
            <div className={`dd ${open === "versions" ? "open" : ""}`}>
                <button className="dd-btn hover-red" onClick={() => toggle("versions")}>Versions <ChevronDown /></button>
                {open === "versions" && (
                    <div className="dd-menu">
                        <button className="hover-red" onClick={() => { closeAll(); onListVersions(); }}>Show versions</button>
                        <button className="hover-red" onClick={() => { closeAll(); onGotoVersion(); }}>Go to version</button>
                        <hr />
                        <button className="hover-red" onClick={() => { closeAll(); onSaveVersion(); }}>Save version</button>
                        <button className="hover-red" onClick={() => { closeAll(); onListSavedVersions(); }}>Show saved versions</button>
                        <button className="hover-red" onClick={() => { closeAll(); onGotoSavedVersion(); }}>Get saved version</button>
                    </div>
                )}
            </div>

            {/* spacer */}
            <div className="grow" />

            {/* Dark mode toggle */}
            <button className="dark-btn hover-red" onClick={onToggleDark}>
                {dark ? "Dark: ON" : "Dark: OFF"}
            </button>
        </div>
    );
}
