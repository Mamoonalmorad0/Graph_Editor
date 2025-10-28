export default function Banner({ notice, onDismiss }) {
    if (!notice) return null;
    return (
        <div className={`banner ${notice.type || "info"}`}>
            <div className="banner-row">
                <strong className="banner-title">
                    {notice.title || (notice.type === "error" ? "Error" : notice.type === "success" ? "Done" : "Info")}
                </strong>
                <button className="banner-x" onClick={onDismiss} aria-label="Dismiss">×</button>
            </div>
            {notice.msg && <div className="banner-msg">{notice.msg}</div>}
        </div>
    );
}
