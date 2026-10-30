export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flex: "none",
        border: "1.5px solid #e3d6c1",
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "spin .9s linear infinite",
      }}
    />
  );
}

export function IndeterminateBar({ height = 1 }: { height?: number }) {
  return (
    <div style={{ height, background: "var(--border-weak)", overflow: "hidden", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: "100%",
          width: "40%",
          background: "var(--accent)",
          animation: "slide 1.6s ease-in-out infinite",
        }}
      />
    </div>
  );
}
