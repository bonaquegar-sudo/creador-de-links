/**
 * Google Maps Review Link Generator
 * Automatically converts Google Maps URLs (0x...:0x...) into official Google Place IDs (ChIJ...)
 * and builds the exact review URL: https://search.google.com/local/writereview?placeid=PLACE_ID
 */

// State
let currentQRCode = null;
const STORAGE_KEY_THEME = 'gm_reviewer_theme';
const STORAGE_KEY_HISTORY = 'gm_reviewer_history';

// Sample URLs for quick testing
const SAMPLES = [
    {
        url: "https://maps.app.goo.gl/KpgErZfHSTVbuHfX8",
        label: "Lelato (Enlace móvil maps.app.goo.gl)"
    },
    {
        url: "https://www.google.com/maps/place/Catedral+de+la+Encarnaci%C3%B3n+de+M%C3%A1laga/@36.7201738,-4.4222485,17z/data=!4m6!3m5!1s0xd72f7bf2805efb1:0x84c2f1618a8f15d7!8m2!3d36.7201738!4d-4.4196736!16zL20vMDY1ODk1?entry=ttu",
        label: "Catedral de Málaga (Google Maps URL)"
    },
    {
        url: "ChIJse8F2L93cg0R1xWPimHxwoQ",
        label: "Place ID Oficial (ChIJ...)"
    },
    {
        url: "https://www.google.com/maps/place/?cid=9566415745749726679",
        label: "Google CID Decimal"
    }
];

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initEventListeners();
    loadHistory();
});

/* ==========================================================================
   Theme Management
   ========================================================================== */
function initTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEY_THEME) || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem(STORAGE_KEY_THEME, next);
        });
    }
}

/* ==========================================================================
   Event Listeners
   ========================================================================== */
function initEventListeners() {
    const mapsInput = document.getElementById('mapsInput');
    const pasteBtn = document.getElementById('pasteBtn');
    const clearBtn = document.getElementById('clearBtn');
    const sampleBtn = document.getElementById('sampleBtn');

    // Auto process on input/paste
    if (mapsInput) {
        mapsInput.addEventListener('input', () => {
            const val = mapsInput.value.trim();
            if (val.length > 0) {
                clearBtn.classList.remove('hidden');
                clearTimeout(window.inputDebounce);
                window.inputDebounce = setTimeout(() => {
                    processInput(true); // silent / live mode
                }, 300);
            } else {
                clearBtn.classList.add('hidden');
                hideResult();
            }
        });
    }

    if (pasteBtn) {
        pasteBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text && mapsInput) {
                    mapsInput.value = text.trim();
                    clearBtn.classList.remove('hidden');
                    processInput();
                }
            } catch (err) {
                showToast("Por favor pega el enlace manualmente (Ctrl+V)", true);
            }
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (mapsInput) {
                mapsInput.value = '';
                mapsInput.focus();
                clearBtn.classList.add('hidden');
                hideResult();
                hideStatus();
            }
        });
    }

    if (sampleBtn) {
        sampleBtn.addEventListener('click', () => {
            const randomSample = SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
            if (mapsInput) {
                mapsInput.value = randomSample.url;
                clearBtn.classList.remove('hidden');
                processInput();
            }
        });
    }
}

/* ==========================================================================
   Mathematical Hex (0x...:0x...) to Place ID (ChIJ...) Protobuf Encoder
   ========================================================================== */
/**
 * Converts a pair of 64-bit Hex integers (cell_id and feature_id from Google Maps)
 * into Google's standard Place ID string (ChIJ...) using Protocol Buffers encoding.
 */
function convertHexToPlaceId(hex1Str, hex2Str) {
    try {
        const val1 = BigInt(hex1Str);
        const val2 = BigInt(hex2Str);

        // 8 bytes in Little Endian for each uint64
        const b1 = [];
        const b2 = [];
        for (let i = 0; i < 8; i++) {
            b1.push(Number((val1 >> BigInt(i * 8)) & 0xFFn));
            b2.push(Number((val2 >> BigInt(i * 8)) & 0xFFn));
        }

        // Protobuf structure:
        // 0x0A (field 1, wire type 2: length delimited)
        // 0x12 (18 bytes payload)
        // 0x09 (field 1, wire type 1: 64-bit fixed) + 8 bytes b1
        // 0x11 (field 2, wire type 1: 64-bit fixed) + 8 bytes b2
        const protoBytes = new Uint8Array([
            0x0a, 0x12, 0x09,
            ...b1,
            0x11,
            ...b2
        ]);

        // Convert bytes to binary string
        let binaryStr = '';
        for (let i = 0; i < protoBytes.length; i++) {
            binaryStr += String.fromCharCode(protoBytes[i]);
        }

        // Standard Base64 to URL-Safe Base64 (replace + with -, / with _, remove =)
        const base64 = btoa(binaryStr);
        const placeId = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        return placeId;
    } catch (e) {
        console.error("Error converting Hex to Place ID:", e);
        return null;
    }
}

/* ==========================================================================
   Place ID & CID Extraction Core Logic
   ========================================================================== */

/**
 * Unwraps Google Maps URLs that may be wrapped inside consent, redirect, or search params
 * (e.g. consent.google.com/ml?continue=... or google.com/url?q=...)
 */
function unwrapGoogleUrl(url) {
    if (!url || typeof url !== 'string') return url;
    try {
        let current = url.trim();
        if (current.includes('continue=') || current.includes('url=') || current.includes('q=')) {
            const parsed = new URL(current.startsWith('http') ? current : 'https://' + current);
            const target = parsed.searchParams.get('continue') || parsed.searchParams.get('url') || parsed.searchParams.get('q');
            if (target && (target.includes('google.com/maps') || target.includes('!1s0x') || target.includes('/place/'))) {
                current = decodeURIComponent(target);
            }
        }
        return current;
    } catch (e) {
        return url;
    }
}

/**
 * Detects if a URL is a Google Maps shortened link from mobile or share features
 * (maps.app.goo.gl, goo.gl/maps, g.co/kgs, etc.)
 */
function isShortGoogleMapsUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const clean = url.trim();
    return /maps\.app\.goo\.gl\/[a-zA-Z0-9_-]+/i.test(clean) ||
           /goo\.gl\/maps\/[a-zA-Z0-9_-]+/i.test(clean) ||
           /g\.co\/kgs\/[a-zA-Z0-9_-]+/i.test(clean) ||
           /page\.link\/[a-zA-Z0-9_-]+/i.test(clean);
}

/**
 * Asynchronously unshortens maps.app.goo.gl or other shortlinks to extract the full place data
 */
async function resolveShortUrl(shortUrl) {
    if (!shortUrl) return null;
    let target = shortUrl.trim();
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
        target = 'https://' + target;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6500);

        const res = await fetch(`https://unshorten.me/json/${encodeURIComponent(target)}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            if (data && data.success && data.resolved_url) {
                const unwrapped = unwrapGoogleUrl(data.resolved_url);
                const extracted = extractGoogleMapsId(unwrapped);
                if (extracted) {
                    return extracted;
                }
            }
        }
    } catch (err) {
        console.warn("No se pudo expandir el enlace corto automáticamente:", err);
    }

    return null;
}

/**
 * Renders an interactive helper card if a short link cannot be resolved in background (e.g. adblocker)
 */
function showShortLinkHelper(shortUrl) {
    const statusBox = document.getElementById('statusMessage');
    if (!statusBox) return;

    let targetUrl = shortUrl.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
    }

    statusBox.className = 'status-box warning shortlink-box';
    statusBox.innerHTML = `
        <div class="shortlink-helper-container">
            <div class="shortlink-helper-title">
                <span>📱</span>
                <strong>Enlace corto móvil detectado (<code>maps.app.goo.gl</code>)</strong>
            </div>
            <p class="shortlink-helper-desc">
                Google protege estos enlaces acortados para que solo se abran en su aplicación o navegador.
                Para obtener el Place ID oficial en 2 segundos:
            </p>
            <div class="shortlink-helper-steps">
                <div class="shortlink-step">
                    <span class="step-badge">Paso 1</span>
                    <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" class="action-btn-highlight">
                        Abrir ficha en Google Maps ↗
                    </a>
                </div>
                <div class="shortlink-step">
                    <span class="step-badge">Paso 2</span>
                    <span>Copia la dirección completa de la barra del navegador y haz clic aquí:</span>
                    <button type="button" class="action-btn-highlight secondary" onclick="handlePasteExpandedUrl()">
                        📋 Pegar enlace copiado
                    </button>
                </div>
            </div>
        </div>
    `;
    statusBox.classList.remove('hidden');
}

async function handlePasteExpandedUrl() {
    const mapsInput = document.getElementById('mapsInput');
    const clearBtn = document.getElementById('clearBtn');
    try {
        const text = await navigator.clipboard.readText();
        if (text && mapsInput) {
            mapsInput.value = text.trim();
            if (clearBtn) clearBtn.classList.remove('hidden');
            processInput();
        }
    } catch (err) {
        showToast("Pega el enlace manualmente en la casilla (Ctrl+V)", true);
    }
}

function showLoadingStatus(msg) {
    const statusBox = document.getElementById('statusMessage');
    if (!statusBox) return;
    statusBox.className = 'status-box info';
    statusBox.innerHTML = `<div class="status-loading-spinner"></div> <span>${msg}</span>`;
    statusBox.classList.remove('hidden');
}

function extractGoogleMapsId(input) {
    if (!input || typeof input !== 'string') return null;
    input = unwrapGoogleUrl(input.trim());

    // Extract Business Name from URL if present
    let businessName = null;
    const nameMatch = input.match(/\/maps\/place\/([^\/@?#]+)/i);
    if (nameMatch && nameMatch[1] && nameMatch[1] !== '') {
        try {
            businessName = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
        } catch (e) {
            businessName = nameMatch[1].replace(/\+/g, ' ');
        }
    }

    // Check if the URL is an empty coordinates map without a business selected
    if (input.includes('/maps/place//@') || (input.includes('/maps/@') && !input.includes('!1s0x'))) {
        return {
            isCoordinateOnly: true,
            message: "Has pegado un enlace general del mapa sin ningún negocio seleccionado. Por favor haz clic en el nombre o ficha del negocio en Google Maps para que aparezca en la barra de direcciones."
        };
    }

    // 1. Direct Place ID match (ChIJ pattern: standard 27 chars)
    const chijMatch = input.match(/ChIJ[a-zA-Z0-9_-]{27}/);
    if (chijMatch) {
        const placeId = chijMatch[0];
        return {
            placeId: placeId,
            featureId: null,
            cidDecimal: null,
            businessName: businessName || "Negocio Verificado",
            type: "Place ID Oficial (ChIJ)",
            rawId: placeId,
            reviewUrl: `https://search.google.com/local/writereview?placeid=${placeId}`
        };
    }

    // 2. Query param place_id or placeid
    const placeIdParam = input.match(/(?:[?&](?:place_id|placeid|query_place_id)=|place_id:)([^&\s]+)/i);
    if (placeIdParam && placeIdParam[1]) {
        const decoded = decodeURIComponent(placeIdParam[1]);
        const placeId = decoded.startsWith('ChIJ') ? decoded : (decoded.includes(':') ? convertHexToPlaceId(decoded.split(':')[0], decoded.split(':')[1]) || decoded : decoded);
        return {
            placeId: placeId,
            featureId: null,
            cidDecimal: null,
            businessName: businessName || "Negocio Verificado",
            type: "Place ID",
            rawId: placeId,
            reviewUrl: `https://search.google.com/local/writereview?placeid=${placeId}`
        };
    }

    // 3. Hex feature data pattern in Google Maps URL: !1s0x...:0x... or 0x...:0x...
    // Example: !1s0xd72f06c7fbfd707:0x77fb6b02c457774c
    const hexFeatureMatch = input.match(/(0x[0-9a-fA-F]+):(0x[0-9a-fA-F]+)/);
    if (hexFeatureMatch) {
        const part1 = hexFeatureMatch[1];
        const part2 = hexFeatureMatch[2];
        const fullFeatureId = `${part1}:${part2}`;

        // Convert mathematically to the exact official Place ID (ChIJ...)
        const generatedPlaceId = convertHexToPlaceId(part1, part2);

        // Convert hex part 2 to Decimal CID
        let decimalCid = null;
        try {
            decimalCid = BigInt(part2).toString();
        } catch (e) {}

        const finalPlaceId = generatedPlaceId || fullFeatureId;

        return {
            placeId: finalPlaceId,
            featureId: fullFeatureId,
            cidDecimal: decimalCid,
            businessName: businessName || "Negocio en Google Maps",
            type: generatedPlaceId ? "Place ID Convertido (ChIJ)" : "Feature ID (0x...)",
            rawId: finalPlaceId,
            reviewUrl: `https://search.google.com/local/writereview?placeid=${finalPlaceId}`,
            cidUrl: decimalCid ? `https://maps.google.com/?cid=${decimalCid}` : null
        };
    }

    // 4. Standalone Hex ID (e.g. 0x84c2bc6f8b1db5d7)
    const singleHexMatch = input.match(/^0x[0-9a-fA-F]+$/i);
    if (singleHexMatch) {
        const hexVal = singleHexMatch[0];
        let decimalCid = null;
        try {
            decimalCid = BigInt(hexVal).toString();
        } catch (e) {}

        return {
            placeId: hexVal,
            featureId: hexVal,
            cidDecimal: decimalCid,
            businessName: "Negocio Local",
            type: "Hex ID (0x...)",
            rawId: hexVal,
            reviewUrl: decimalCid ? `https://maps.google.com/?cid=${decimalCid}` : `https://search.google.com/local/writereview?placeid=${hexVal}`,
            cidUrl: decimalCid ? `https://maps.google.com/?cid=${decimalCid}` : null
        };
    }

    // 5. CID in URL (decimal): ?cid=123456789... or &ludocid=123456789...
    const cidParamMatch = input.match(/[?&](?:cid|ludocid)=(\d+)/i);
    if (cidParamMatch && cidParamMatch[1]) {
        const decimalCid = cidParamMatch[1];
        return {
            placeId: decimalCid,
            featureId: null,
            cidDecimal: decimalCid,
            businessName: businessName || "Negocio Local",
            type: "Google CID Decimal",
            rawId: decimalCid,
            reviewUrl: `https://maps.google.com/?cid=${decimalCid}`,
            cidUrl: `https://maps.google.com/?cid=${decimalCid}`
        };
    }

    // 6. Standalone numeric CID (e.g. 9566415745749726679)
    if (/^\d{15,22}$/.test(input)) {
        const decimalCid = input;
        return {
            placeId: decimalCid,
            featureId: null,
            cidDecimal: decimalCid,
            businessName: "Negocio Local",
            type: "Google CID Decimal",
            rawId: decimalCid,
            reviewUrl: `https://maps.google.com/?cid=${decimalCid}`,
            cidUrl: `https://maps.google.com/?cid=${decimalCid}`
        };
    }

    return null;
}

/* ==========================================================================
   Main Processing Function
   ========================================================================== */
async function processInput(isLive = false) {
    const inputEl = document.getElementById('mapsInput');
    const generateBtn = document.getElementById('generateBtn');
    if (!inputEl) return;

    let input = inputEl.value.trim();
    if (!input) {
        if (!isLive) showError("Por favor introduce una URL de Google Maps o un Place ID.");
        return;
    }

    hideStatus();

    // Check if it's a short URL (maps.app.goo.gl, etc.)
    if (isShortGoogleMapsUrl(input)) {
        // If live typing, ensure there's enough token (e.g. at least 6 chars after domain)
        const parts = input.split('/');
        if (isLive && parts[parts.length - 1].length < 6) {
            return;
        }

        if (generateBtn) generateBtn.classList.add('loading');
        showLoadingStatus("Resolviendo enlace móvil maps.app.goo.gl...");

        const extracted = await resolveShortUrl(input);

        if (generateBtn) generateBtn.classList.remove('loading');
        hideStatus();

        if (extracted) {
            displayResult(extracted, input);
            saveToHistory(extracted, input);
            if (!isLive) {
                showToast("¡Enlace móvil resuelto y reseña generada!");
            }
            return;
        } else {
            hideResult();
            showShortLinkHelper(input);
            return;
        }
    }

    // Standard extraction
    const extracted = extractGoogleMapsId(input);

    if (extracted) {
        if (extracted.isCoordinateOnly) {
            showWarning(extracted.message);
            hideResult();
            return;
        }

        displayResult(extracted, input);
        saveToHistory(extracted, input);
        if (!isLive) {
            showToast("¡Enlace de reseña generado con éxito!");
        }
    } else {
        if (!isLive) {
            showError("No se pudo detectar el ID del negocio. Abre la ficha de tu negocio en Google Maps y copia la URL completa de la barra de direcciones.");
        }
    }
}

/* ==========================================================================
   Display Results & QR Code
   ========================================================================== */
function displayResult(data, originalInput) {
    const resultCard = document.getElementById('resultCard');
    const finalReviewUrlInput = document.getElementById('finalReviewUrl');
    const testReviewBtn = document.getElementById('testReviewBtn');
    const idTypeBadge = document.getElementById('idTypeBadge');
    const extractedIdEl = document.getElementById('extractedId');
    const extractedBusinessName = document.getElementById('extractedBusinessName');
    const cidItemRow = document.getElementById('cidItemRow');
    const extractedCidEl = document.getElementById('extractedCid');
    const altUrlItemRow = document.getElementById('altUrlItemRow');
    const altReviewUrlInput = document.getElementById('altReviewUrl');

    if (!resultCard) return;

    // Set business name
    if (extractedBusinessName) {
        extractedBusinessName.innerText = data.businessName || "Negocio en Google Maps";
    }

    // Set exact write review URL requested by user
    const targetReviewUrl = data.reviewUrl;
    finalReviewUrlInput.value = targetReviewUrl;
    testReviewBtn.href = targetReviewUrl;
    idTypeBadge.innerText = data.type;
    extractedIdEl.innerText = data.placeId || data.rawId;

    // Show/hide CID row
    if (data.cidDecimal) {
        cidItemRow.style.display = 'flex';
        extractedCidEl.innerText = data.cidDecimal;
        altUrlItemRow.style.display = 'flex';
        altReviewUrlInput.value = `https://maps.google.com/?cid=${data.cidDecimal}`;
    } else {
        cidItemRow.style.display = 'none';
        altUrlItemRow.style.display = 'none';
    }

    // Generate QR Code with the review URL
    renderQRCode(targetReviewUrl);

    // Make visible
    resultCard.classList.remove('hidden');
}

function hideResult() {
    const resultCard = document.getElementById('resultCard');
    if (resultCard) resultCard.classList.add('hidden');
}

/* ==========================================================================
   QR Code Generator
   ========================================================================== */
function renderQRCode(text) {
    const qrContainer = document.getElementById('qrcodeCanvas');
    if (!qrContainer) return;

    qrContainer.innerHTML = '';

    if (typeof QRCode !== 'undefined') {
        currentQRCode = new QRCode(qrContainer, {
            text: text,
            width: 140,
            height: 140,
            colorDark: "#0b0f19",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
    } else {
        // Fallback
        const img = document.createElement('img');
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(text)}`;
        img.alt = "Código QR de Reseña";
        img.style.width = "140px";
        img.style.height = "140px";
        qrContainer.appendChild(img);
    }
}

function downloadQRCode(format = 'png') {
    const qrContainer = document.getElementById('qrcodeCanvas');
    if (!qrContainer) return;

    let canvas = qrContainer.querySelector('canvas');
    let img = qrContainer.querySelector('img');

    let link = document.createElement('a');
    link.download = `google-review-qr.${format}`;

    if (canvas) {
        link.href = canvas.toDataURL(`image/${format}`);
        link.click();
        showToast("Descargando Código QR...");
    } else if (img && img.src) {
        link.href = img.src;
        link.target = "_blank";
        link.click();
    } else {
        showToast("No se pudo descargar el QR", true);
    }
}

/* ==========================================================================
   Batch Processing Mode
   ========================================================================== */
function switchTab(tab) {
    const tabSingle = document.getElementById('tabSingle');
    const tabBatch = document.getElementById('tabBatch');

    const singlePanel = document.getElementById('singlePanel');
    const batchPanel = document.getElementById('batchPanel');

    if (tab === 'single') {
        tabSingle.classList.add('active');
        tabBatch.classList.remove('active');
        singlePanel.classList.add('active');
        batchPanel.classList.remove('active');
    } else {
        tabBatch.classList.add('active');
        tabSingle.classList.remove('active');
        batchPanel.classList.add('active');
        singlePanel.classList.remove('active');
    }
}

let batchDataStore = [];

async function processBatch() {
    const batchInput = document.getElementById('batchInput');
    const processBatchBtn = document.getElementById('processBatchBtn');
    if (!batchInput) return;

    const lines = batchInput.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) {
        showToast("Por favor ingresa al menos una URL por línea.", true);
        return;
    }

    const tableBody = document.getElementById('batchTableBody');
    const container = document.getElementById('batchResultsContainer');
    const countEl = document.getElementById('batchCount');

    tableBody.innerHTML = '';
    batchDataStore = [];

    if (processBatchBtn) {
        processBatchBtn.disabled = true;
        processBatchBtn.classList.add('loading');
    }

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        let extracted = null;

        if (isShortGoogleMapsUrl(line)) {
            extracted = await resolveShortUrl(line);
        } else {
            extracted = extractGoogleMapsId(line);
        }

        const finalUrl = (extracted && extracted.reviewUrl) ? extracted.reviewUrl : '-';
        const type = (extracted && extracted.type) ? extracted.type : 'Inválido';

        batchDataStore.push({
            index: index + 1,
            original: line,
            type: type,
            url: finalUrl,
            status: (extracted && !extracted.isCoordinateOnly) ? 'OK' : 'Error'
        });

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td><span class="id-type-badge">${type}</span></td>
            <td><a href="${finalUrl}" target="_blank" style="color: var(--google-blue); word-break: break-all;">${finalUrl}</a></td>
            <td>
                ${(extracted && !extracted.isCoordinateOnly) ? `
                    <button class="action-btn" onclick="copyText('${finalUrl}', this)">Copiar</button>
                ` : '<span style="color: var(--google-red); font-size:0.8rem;">Inválido</span>'}
            </td>
        `;
        tableBody.appendChild(tr);
    }

    if (processBatchBtn) {
        processBatchBtn.disabled = false;
        processBatchBtn.classList.remove('loading');
    }

    countEl.innerText = batchDataStore.length;
    container.classList.remove('hidden');
    showToast(`Se procesaron ${batchDataStore.length} enlaces.`);
}

function exportBatchCSV() {
    if (batchDataStore.length === 0) return;

    let csvContent = "data:text/csv;charset=utf-8,Index,Tipo,EnlaceResena,OriginalInput\n";
    batchDataStore.forEach(item => {
        csvContent += `"${item.index}","${item.type}","${item.url}","${item.original.replace(/"/g, '""')}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "enlaces_resenas_google.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Archivo CSV exportado.");
}

/* ==========================================================================
   History (LocalStorage)
   ========================================================================== */
function loadHistory() {
    const historySection = document.getElementById('historySection');
    const historyList = document.getElementById('historyList');
    if (!historySection || !historyList) return;

    const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (!raw) {
        historySection.classList.add('hidden');
        return;
    }

    try {
        const list = JSON.parse(raw);
        if (!Array.isArray(list) || list.length === 0) {
            historySection.classList.add('hidden');
            return;
        }

        historyList.innerHTML = '';
        list.slice(0, 5).forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'history-item';
            itemDiv.innerHTML = `
                <span class="history-text" title="${item.url}">${item.name || item.id} &bull; ${item.url}</span>
                <div class="history-actions">
                    <button class="action-btn" onclick="loadHistoryItem('${item.original || item.url}')" title="Cargar">Cargar</button>
                    <button class="action-btn" onclick="copyText('${item.url}', this)" title="Copiar">Copiar</button>
                </div>
            `;
            historyList.appendChild(itemDiv);
        });

        historySection.classList.remove('hidden');
    } catch (e) {
        console.error("Error reading history:", e);
    }
}

function saveToHistory(extracted, originalUrl) {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
        let list = raw ? JSON.parse(raw) : [];
        const finalUrl = extracted.reviewUrl;

        // Deduplicate
        list = list.filter(item => item.url !== finalUrl);
        list.unshift({
            id: extracted.placeId || extracted.rawId,
            name: extracted.businessName,
            url: finalUrl,
            original: originalUrl,
            type: extracted.type,
            time: new Date().toISOString()
        });

        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(list.slice(0, 10)));
        loadHistory();
    } catch (e) {
        console.warn("Could not save to history:", e);
    }
}

function loadHistoryItem(url) {
    const mapsInput = document.getElementById('mapsInput');
    if (mapsInput) {
        mapsInput.value = url;
        processInput();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function clearHistory() {
    localStorage.removeItem(STORAGE_KEY_HISTORY);
    loadHistory();
    showToast("Historial borrado");
}

/* ==========================================================================
   UI Helpers (Toast, Clipboard, Status)
   ========================================================================== */
function copyToClipboard(elementId, btnElement) {
    const input = document.getElementById(elementId);
    if (!input) return;
    copyText(input.value, btnElement);
}

function copyText(text, btnElement) {
    if (!text || text === '-') return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showCopySuccess(btnElement);
            showToast("Enlace copiado al portapapeles");
        }).catch(() => {
            fallbackCopyText(text, btnElement);
        });
    } else {
        fallbackCopyText(text, btnElement);
    }
}

function fallbackCopyText(text, btnElement) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        showCopySuccess(btnElement);
        showToast("Enlace copiado al portapapeles");
    } catch (err) {
        showToast("No se pudo copiar automáticamente", true);
    }
    document.body.removeChild(textArea);
}

function showCopySuccess(btnElement) {
    if (!btnElement) return;
    const origHtml = btnElement.innerHTML;
    btnElement.classList.add('copied');
    btnElement.innerHTML = `✓ Copiado`;
    setTimeout(() => {
        btnElement.classList.remove('copied');
        btnElement.innerHTML = origHtml;
    }, 1800);
}

function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    const toastIcon = document.getElementById('toastIcon');

    if (!toast || !toastMsg) return;

    toastMsg.innerText = msg;
    toastIcon.innerText = isError ? '⚠️' : '✓';
    toast.style.borderColor = isError ? 'rgba(234, 67, 53, 0.4)' : 'rgba(52, 168, 83, 0.4)';
    toast.classList.remove('hidden');

    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => {
        toast.classList.add('hidden');
    }, 2800);
}

function showError(msg) {
    const statusBox = document.getElementById('statusMessage');
    if (!statusBox) return;
    statusBox.className = 'status-box error';
    statusBox.innerHTML = `<span>⚠️</span> <span>${msg}</span>`;
    statusBox.classList.remove('hidden');
}

function showWarning(msg) {
    const statusBox = document.getElementById('statusMessage');
    if (!statusBox) return;
    statusBox.className = 'status-box warning';
    statusBox.innerHTML = `<span>💡</span> <span>${msg}</span>`;
    statusBox.classList.remove('hidden');
}

function showInfo(msg) {
    const statusBox = document.getElementById('statusMessage');
    if (!statusBox) return;
    statusBox.className = 'status-box info';
    statusBox.innerHTML = `<span>ℹ️</span> <span>${msg}</span>`;
    statusBox.classList.remove('hidden');
}

function hideStatus() {
    const statusBox = document.getElementById('statusMessage');
    if (statusBox) statusBox.classList.add('hidden');
}
