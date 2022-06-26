// ==UserScript==
// @name        battle_stats_predictor
// @description Show battle stats prediction, computed by a third party service
// @version     1.00
// @namespace   tdup.battleStatsPredictor
// @match       https://www.torn.com/profiles.php*
// @run-at      document-end
// @grant       GM_addStyle
// @grant       GM_xmlhttpRequest
// @connect     api.torn.com
// @connect     localhost
// @connect     www.lol-manager.com
// @author      TDup
// ==/UserScript==


(function() {
    'use strict';

    var randomUselessArray = Array();
    var isInjected = false;
    var playerId = -1;
    var Score = "N/A";
    var TBS = "N/A";
    var divToInject;

    var observer = new MutationObserver(function(mutations, observer) {
      mutations.forEach(function(mutation) {
        for (const element of mutation.addedNodes) {
          if (element.querySelector)
          {
              var el = document.querySelectorAll('.empty-block')
              for(var i = 0; i < el.length; ++i)
              {
                  if (isInjected)
                  {
                    break;
                  }
                  divToInject = el[i];
                  isInjected = true;
                  fetchScoreAndTBSAsync(playerId);
              }
          }
        }
      });
    });

    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    playerId = urlParams.get('XID');

    observer.observe(document, {attributes: false, childList: true, characterData: false, subtree:true});

    async function fetchScoreAndTBSAsync(playerId) {
        const json = await fetchScoreAndTBS(playerId);
        TBS = json.TBS.toLocaleString('en-US');
        Score = json.Score.toLocaleString('en-US');
        divToInject.innerHTML += '<div id="Tdup" style="color: red; font-size: 18px;"><b>TBS = '+ TBS + '<br />Score = '+ Score + '</b></div>';
    }

    function fetchScoreAndTBS(targetId) {
    const apiKey = "EEDupSOEZCTuJzah";
    const playerId = 2660552;
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            // method: 'POST',
            method: 'GET',
            url :`http://www.lol-manager.com/api/battlestats/${apiKey}/${playerId}/${targetId}`,
           // url: `https://api.torn.com/user/${playerId}?selections=personalstats&comment=RacingUiUx&key=${apiKey}`,
            headers: {
                'Content-Type': 'application/json'
            },
            onload: (response) => {
                try {
                    resolve(JSON.parse(response.responseText));
                } catch(err) {
                    reject(err);
                }
            },
            onerror: (err) => {
                reject(err);
            }
        });
    });
}

})();