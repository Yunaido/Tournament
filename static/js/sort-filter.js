(function () {
    var sel = document.getElementById("sort-select");
    if (!sel) return;

    var params = new URLSearchParams(window.location.search);
    var currentType = params.get("type") || "";

    /* Override browser back-forward cache form restoration */
    sel.value = params.get("sort") || "date_desc";

    sel.addEventListener("change", function () {
        var url = new URL(window.location);
        url.searchParams.set("sort", sel.value);
        if (currentType) {
            url.searchParams.set("type", currentType);
        } else {
            url.searchParams.delete("type");
        }
        window.location.href = url.toString();
    });
})();
