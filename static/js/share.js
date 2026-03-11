/**
 * Copy-to-clipboard & Web Share API logic for share modals.
 *
 * Expected DOM:
 *   #copy-btn          — button that copies the URL
 *   #tournament-url OR #invite-url — readonly input with the URL
 *   #web-share-btn OR #share-btn   — button for Web Share API
 *   #shareModal[data-share-title]   — share title (optional)
 *   #shareModal[data-share-text]    — share body  (optional)
 */
(function () {
    var copyBtn = document.getElementById('copy-btn');
    var shareBtn = document.getElementById('web-share-btn') || document.getElementById('share-btn');
    var urlField = document.getElementById('tournament-url') || document.getElementById('invite-url');
    var modal = document.getElementById('shareModal');

    if (!copyBtn || !urlField) return;

    copyBtn.addEventListener('click', function () {
        var orig = copyBtn.textContent;
        function showCopied() {
            copyBtn.textContent = '\u2713 Copied!';
            setTimeout(function () { copyBtn.textContent = orig; }, 1500);
        }
        navigator.clipboard.writeText(urlField.value).then(showCopied).catch(function () {
            urlField.select();
            urlField.setSelectionRange(0, 99999);
            try { document.execCommand('copy'); } catch (e) { /* noop */ }
            showCopied();
        });
    });

    if (shareBtn && navigator.share) {
        shareBtn.style.display = 'inline-block';
        shareBtn.addEventListener('click', function () {
            var source = modal || shareBtn;
            navigator.share({
                title: source.dataset.shareTitle || 'OP TCG Tournament',
                text: source.dataset.shareText || 'Join this One Piece TCG tournament!',
                url: urlField.value,
            }).catch(function () {});
        });
    }
})();
