import { useEffect, useState } from "react";

export default function Modal({
    open, title, description, fields = [],
    confirmText = "OK", cancelText = "Cancel",
    onClose, onSubmit
}) {
    const [values, setValues] = useState(() =>
        Object.fromEntries(fields.map(f => [f.name, f.defaultValue ?? ""]))
    );

    useEffect(() => {
        if (open) {
            setValues(Object.fromEntries(fields.map(f => [f.name, f.defaultValue ?? ""])));
        }
    }, [open, fields]);

    if (!open) return null;

    const submit = (e) => {
        e?.preventDefault?.();
        onSubmit?.(values);
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <strong>{title}</strong>
                    <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
                </div>
                {(description && <p className="modal-desc">{description}</p>) || null}
                <form onSubmit={submit} className="modal-form">
                    {fields.map(f => {
                        const listId = f.datalistOptions ? `${f.name}-list` : undefined;
                        return (
                            <label key={f.name} className="modal-field">
                                <span>{f.label}</span>
                                {f.type === "textarea" ? (
                                    <textarea
                                        rows={f.rows ?? 4}
                                        value={values[f.name] ?? ""}
                                        placeholder={f.placeholder}
                                        onChange={(e) => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                                    />
                                ) : (
                                    <>
                                        <input
                                            type={f.type ?? "text"}
                                            list={listId}
                                            value={values[f.name] ?? ""}
                                            placeholder={f.placeholder}
                                            step={f.step}
                                            onChange={(e) => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                                        />
                                        {f.datalistOptions && (
                                            <datalist id={listId}>
                                                {f.datalistOptions.map(opt => (
                                                    <option key={opt} value={opt} />
                                                ))}
                                            </datalist>
                                        )}
                                    </>
                                )}
                            </label>
                        );
                    })}
                    <div className="modal-actions">
                        <button type="button" className="btn hover-red" onClick={onClose}>{cancelText}</button>
                        <button type="submit" className="btn btn-primary hover-red">{confirmText}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
