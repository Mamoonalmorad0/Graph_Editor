import { useEffect, useRef, useState } from "react";

export default function AutocompleteInput({
    value,
    onChange,
    onSelect,
    options = [],
    placeholder = "",
    maxItems = 10,
    inputClassName = "search-input",
}) {
    const ref = useRef(null);
    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(0);

    const norm = (s) => String(s || "").toLowerCase();
    const filtered = (() => {
        const v = norm(value);
        if (!v) return options.slice(0, maxItems);
        const starts = options.filter(o => norm(o).startsWith(v));
        const contains = options.filter(o => !norm(o).startsWith(v) && norm(o).includes(v));
        return [...starts, ...contains].slice(0, maxItems);
    })();

    useEffect(() => {
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const commit = (val) => {
        onSelect?.(val);
        onChange?.({ target: { value: val } });
        setOpen(false);
    };

    return (
        <div className="ac-wrap" ref={ref}>
            <input
                className={inputClassName}
                value={value}
                placeholder={placeholder}
                onChange={(e) => { onChange?.(e); setOpen(true); setHi(0); }}
                onFocus={() => setOpen(true)}
                onKeyDown={(e) => {
                    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { setOpen(true); return; }
                    if (!open) return;
                    if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
                    else if (e.key === "Enter") { if (filtered[hi]) { e.preventDefault(); commit(filtered[hi]); } }
                    else if (e.key === "Escape") { setOpen(false); }
                }}
                autoComplete="off"
            />
            {open && filtered.length > 0 && (
                <div className="ac-list">
                    {filtered.map((opt, i) => (
                        <div
                            key={opt + i}
                            className={`ac-item ${i === hi ? "active" : ""}`}
                            onMouseEnter={() => setHi(i)}
                            onMouseDown={(e) => { e.preventDefault(); commit(opt); }}
                            role="option"
                            aria-selected={i === hi}
                            title={opt}
                        >
                            {opt}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
