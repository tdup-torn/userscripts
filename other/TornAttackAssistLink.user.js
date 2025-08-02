// ==UserScript==
// @name         TornAttackAssistLink
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Makes player names clickable to their Torn profile, dynamically
// @author       TDup (chatgpt)
// @match        https://www.torn.com/loader.php?sid=attack*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function updatePlayerLinks() {
        const playerSpans = Array.from(document.querySelectorAll('[class^="playername_"]'));

        playerSpans.forEach(span => {
            if (!span.querySelector('a')) { // Prevent double-wrapping
                const playerName = span.textContent;
                const link = document.createElement('a');
                link.href = `https://www.torn.com/profiles.php?NID=${encodeURIComponent(playerName)}`;
                link.textContent = playerName;
                link.style.color = 'inherit'; // Preserves original text styling

                span.textContent = '';
                span.appendChild(link);
            }
        });
    }

    // Initial execution
    updatePlayerLinks();

    // Observe DOM changes since the content may be loaded dynamically
    const observer = new MutationObserver(updatePlayerLinks);
    observer.observe(document.body, { childList: true, subtree: true });
})();
