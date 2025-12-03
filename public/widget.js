(function () {
  // data-company-id を使う実装
  function init() {
    const scriptTag = document.currentScript;
    if (!scriptTag) return;

    const companyId = scriptTag.getAttribute("data-company-id");
    const agentName =
      scriptTag.getAttribute("data-agent-name") || "AIコンシェルジュ";
    const widgetBase =
      scriptTag.getAttribute("data-widget-base-url") ||
      window.NEXT_PUBLIC_WIDGET_BASE_URL ||
      "";

    if (!companyId || !widgetBase) {
      console.warn("[AI Widget] companyId or widgetBase is missing.");
      return;
    }

    // フローティングボタン
    const button = document.createElement("button");
    button.innerText = "AI相談";
    Object.assign(button.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: 999999,
      borderRadius: "9999px",
      padding: "10px 16px",
      border: "none",
      backgroundColor: "#2563eb",
      color: "#fff",
      fontSize: "14px",
      fontWeight: "500",
      boxShadow: "0 10px 15px -3px rgba(15,23,42,0.2)",
      cursor: "pointer",
      transition: "all 0.2s ease",
    });

    button.onmouseover = function () {
      button.style.backgroundColor = "#1d4ed8";
      button.style.transform = "scale(1.05)";
    };
    button.onmouseout = function () {
      button.style.backgroundColor = "#2563eb";
      button.style.transform = "scale(1)";
    };

    // iframe コンテナ
    const iframeWrapper = document.createElement("div");
    Object.assign(iframeWrapper.style, {
      position: "fixed",
      right: "16px",
      bottom: "70px",
      width: "360px",
      height: "520px",
      maxWidth: "95vw",
      maxHeight: "80vh",
      zIndex: 999998,
      boxShadow: "0 25px 50px -12px rgba(15,23,42,0.45)",
      borderRadius: "18px",
      overflow: "hidden",
      display: "none",
      transition: "all 0.3s ease",
    });

    const iframe = document.createElement("iframe");
    iframe.src =
      widgetBase +
      "?companyId=" +
      encodeURIComponent(companyId) +
      "&agentName=" +
      encodeURIComponent(agentName);
    iframe.style.border = "none";
    iframe.style.width = "100%";
    iframe.style.height = "100%";

    iframeWrapper.appendChild(iframe);

    button.addEventListener("click", function () {
      const isHidden = iframeWrapper.style.display === "none";
      iframeWrapper.style.display = isHidden ? "block" : "none";
      button.innerText = isHidden ? "✕ 閉じる" : "AI相談";
    });

    document.body.appendChild(button);
    document.body.appendChild(iframeWrapper);
  }

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
