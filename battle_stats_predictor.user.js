// ==UserScript==
// @name        Battle Stats Predictor
// @description Show battle stats prediction, computed by a third party service
// @version     1.02
// @namespace   tdup.battleStatsPredictor
// @match       https://www.torn.com/profiles.php*
// @run-at      document-end
// @grant       GM_addStyle
// @grant       GM_xmlhttpRequest
// @grant       GM_setValue
// @grant       GM_getValue
// @connect     api.torn.com
// @connect     www.lol-manager.com
// @author      TDup
// ==/UserScript==

// let LOCAL_SCORE = localStorage["tdup.battleStatsPredictor.localScore"];
// let LOCAL_TBS = localStorage["tdup.battleStatsPredictor.localTBS"];
let LOCAL_API_KEY = localStorage["tdup.battleStatsPredictor.TornApiKey"];

$("head").append (
    '<link '
  + 'href="https://stackpath.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" '
  + 'rel="stylesheet" type="text/css">'
);

GM_addStyle(`
@media screen and (max-width: 1000px) {
	.members-cont .bs {
		display: none;
	}
}

.members-cont .level {
	width: 27px !important;
}

.members-cont .id {
	padding-left: 5px !important;
	width: 28px !important;
}

.members-cont .points {
	width: 42px !important;
}

.finally-bs-stat {
	font-family: monospace;
}

.finally-bs-stat > span {
	display: inline-block;
	width: 55px;
	text-align: right;
}

.faction-names {
	position: relative;
}

.finally-bs-api {
	position: absolute;
	background: var(--main-bg);
	text-align: center;
	left: 0;
	top: 0;
	width: 100%;
	height: 100%;
}

.finally-bs-api > * {
	margin: 0 5px;
	padding: 5px;
}

.finally-bs-filter {
	position: absolute !important;
	top: 25px !important;
	left: 0;
	right: 0;
	margin-left: auto;
	margin-right: auto;
	width: 120px;
	cursor: pointer;
}
.finally-bs-filter > input {
	display: block !important;
	width: 100px;
}

.finally-bs-swap {
	position: absolute;
	top: 0px;
	left: 0;
	right: 0;
	margin-left: auto;
	margin-right: auto;
	width: 100px;
	cursor: pointer;
}

.finally-bs-activeIcon {
	display: block !important;
}

.finally-bs-asc {
	border-bottom: 6px solid var(--sort-arrow-color);
	border-left: 6px solid transparent;
	border-right: 6px solid transparent;
	border-top: 0 solid transparent;
	height: 0;
	top: -8px;
	width: 0;
}

.finally-bs-desc {
	border-bottom: 0 solid transparent;
	border-left: 6px solid transparent;
	border-right: 6px solid transparent;
	border-top: 6px solid var(--sort-arrow-border-color);
	height: 0;
	top: -1px;
	width: 0;
}

.finally-bs-col {
	text-overflow: clip !important;
}

.raid-members-list .level:not(.bs) {
	width: 16px !important;
}

div.desc-wrap:not([class*='warDesc']) .finally-bs-swap {
  display: none;
}

div.desc-wrap:not([class*='warDesc']) .faction-names {
  padding-top: 100px !important;
}



.re_spy_title, .re_spy_col {
  display: none !important;
}
`);

function JSONparse(str) {
	try {
		return JSON.parse(str);
	} catch (e) {}
	return null;
}

function checkApiKey(key, cb) {
    //Code by finally.torn.FactionWallBattlestats
	GM_xmlhttpRequest({
		method: "GET",
		url: `https://api.torn.com/user/?comment=BattleStatsPredictorLoginselections=&key=${key}`,
		onload: (r) => {
			if (r.status == 429){
				cb("Couldn't check (rate limit)");
				return;
			}
			if (r.status != 200){
				cb(`Couldn't check (status code ${r.status})`);
				return;
			}

			let j = JSONparse(r.responseText);
			if (!j){
				cb("Couldn't check (unexpected response)");
				return;
			}

			if (!j.status) {
				cb(j.message || "Wrong API key?");
			}
			else {
				LOCAL_API_KEY = key;
				localStorage.setItem("tdup.battleStatsPredictor.TornApiKey", key);
				cb(true);
			}
		},
		onabort: () => cb("Couldn't check (aborted)"),
		onerror: () => cb("Couldn't check (error)"),
		ontimeout: () => cb("Couldn't check (timeout)")
	})
}


//let apiKeyCheck = false;
function addAPIKeyInput(node) {
	if (!node) return;

	node.style.position = "relative";

	let apiKeyNode = document.createElement("div");
	apiKeyNode.className = "text faction-names finally-bs-api";
	apiKeyNode.style.display = (!LOCAL_API_KEY) ? "block" : "none";
	let apiKeyText = document.createElement("span");
	apiKeyText.innerHTML = "Battle Stats Predictor - " + ((!LOCAL_API_KEY) ? "Set" : "Update") + " your API key: ";
	let apiKeyInput = document.createElement("input");
	let apiKeySave = document.createElement("input");
	apiKeySave.type = "button";
	apiKeySave.value = "Save";
	let apiKeyClose = document.createElement("input");
	apiKeyClose.type = "button";
	apiKeyClose.value = "Close";
	apiKeyNode.appendChild(apiKeyText);
	apiKeyNode.appendChild(apiKeyInput);
	apiKeyNode.appendChild(apiKeySave);
	apiKeyNode.appendChild(apiKeyClose);

	function checkApiKeyCb(r) {
		if (r === true) {
			apiKeyNode.style.display = "none";
			apiKeyInput.value = "";
			// loadFactions();
		}
		else {
			apiKeyNode.style.display = "block";
			apiKeyText.innerHTML = `${r}: `;
		}
	}

	apiKeySave.addEventListener("click", () => {
		apiKeyText.innerHTML = "Checking key";
		checkApiKey(apiKeyInput.value, checkApiKeyCb);
	});
	apiKeyClose.addEventListener("click", () => {
		apiKeyNode.style.display = "none";
	});

	let apiKeyButton = document.createElement("a");
	apiKeyButton.className = "t-clear h c-pointer  line-h24 right ";
	apiKeyButton.innerHTML = `
		<i class="fa fa-cog" aria-hidden="true"></i><span> Update Battle Stats Predictor settings</span>
	`;

	apiKeyButton.addEventListener("click", () => {
		apiKeyText.innerHTML = "Battle Stats Predictor - Update your API key: ";
		apiKeyNode.style.display = "block";
	});

	node.querySelector("#top-page-links-list").appendChild(apiKeyButton);
	node.appendChild(apiKeyNode);

	// if (LOCAL_API_KEY && !apiKeyCheck) {
	// 	apiKeyCheck = true;
	// 	checkApiKey(LOCAL_API_KEY, checkApiKeyCb);
	// }
}


(function() {
    'use strict';

    var isInjected = false;
    var TargetId = -1;
    var divWhereToInject;

    addAPIKeyInput(document.querySelector(".content-title"));

    var observer = new MutationObserver(function(mutations, observer) {
      mutations.forEach(function(mutation) {
        for (const node of mutation.addedNodes) {
          if (node.querySelector)
          {
              var el = document.querySelectorAll('.empty-block')
              for(var i = 0; i < el.length; ++i)
              {
                  if (isInjected)
                  {
                    break;
                  }
                  divWhereToInject = el[i];
                  isInjected = true;
                  if (LOCAL_API_KEY)
                  {
                      fetchScoreAndTBSAsync(TargetId);
                  }
              }

              addAPIKeyInput(node.querySelector && node.querySelector(".content-title"));
          }
        }
      });
    });

    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    TargetId = urlParams.get('XID');

    observer.observe(document, {attributes: false, childList: true, characterData: false, subtree:true});

    async function fetchScoreAndTBSAsync(targetId) {
        const json = await fetchScoreAndTBS(targetId);

        let success = json.Success;
        if (success)
        {
            let TBSBalanced = json.TBS_Balanced.toLocaleString('en-US');
            let TBS = json.TBS.toLocaleString('en-US');
            let Score = json.Score.toLocaleString('en-US');
            divWhereToInject.innerHTML += '<div id="Tdup" style="color: red; font-size: 14px; text-align: center;">TBS_1 = '+ TBS + '<br /> TBS_2 = '+ TBSBalanced + '<br /> Battle Stats Score = '+ Score + '</div>';
        }
        else
        {
             divWhereToInject.innerHTML += '<div id="Tdup" style="color: red; font-size: 14px;">Error : ' + json.Reason+'</div>';
        }
    }

    function fetchScoreAndTBS(targetId) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url :`http://www.lol-manager.com/api/battlestats/${LOCAL_API_KEY}/${targetId}`,
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