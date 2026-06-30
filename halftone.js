// Halftone replacement for .jp-columns
// Pipeline: rasterize text → blur → sample alpha → draw variable-radius dots
(function () {
    'use strict';

    const GRID    = 3;    // dot grid spacing px
    const BLUR    = 2;   // gaussian blur radius px (controls halo size)
    const MAIN_PX = 80;   // must match .jp-columns font-size
    const FURI_PX = Math.round(MAIN_PX * 0.30);          // matches rt font-size (0.30em)
    const CHAR_STEP = MAIN_PX + MAIN_PX * (-0.2);        // font-size + letter-spacing(-0.2em) = 72px
    const FURI_STEP = FURI_PX;
    const PAD_TOP = 60;   // matches .jp-text padding-top
    const SKEW    = 0; // Math.tan(-8 * Math.PI / 180);         // skewY(-8deg)

    const MAIN_FONT = `${MAIN_PX}px 'Dela Gothic One', sans-serif`;
    const FURI_FONT = `${FURI_PX}px 'Dela Gothic One', sans-serif`;

    // Text content — vertical-rl: col1 is the rightmost column
    // ruby arrays: each base char index maps to an array of furigana chars
    const COL1 = {
        chars: ['広', '場', 'へ', 'よ', 'う', 'こ', 'そ', '。'],
        ruby:  { 0: ['ひ', 'ろ'], 1: ['ば'] }
    };
    const COL2 = {
        chars: ['沈', '浩', '辰', 'の', 'バ', 'ー', 'チ', 'ャ', 'ル'],
        ruby:  { 0: ['シ', 'ェ', 'ン'], 1: ['ハ', 'オ'], 2: ['チ', 'ェ', 'ン'] }
    };

    let dc = null; // persistent display canvas

    function render(skipPeriod) {
        const jpEl = document.querySelector('.jp-text');
        if (!jpEl) return;

        const rect = jpEl.getBoundingClientRect();
        const W = Math.ceil(rect.width);
        const H = Math.ceil(rect.height);
        if (W < 10 || H < 10) return;

        // ── 1. Rasterize: white text on transparent canvas ───────────────────
        const tc = document.createElement('canvas');
        tc.width = W;
        tc.height = H;
        const ctx = tc.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 5;           // stroke width — lower = thinner/lighter strokes
        ctx.lineJoin = 'round';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';

        // Column layout (left → right inside canvas):
        //   [col1-main] [col1-furi] [gap] [col2-main] [col2-furi]
        // flex-direction: row → col1 (広場) is left, col2 (沈浩辰) is right;
        // ruby appears to the right of each column.
        const GAP = 6;
        const totalW = 2 * MAIN_PX + 2 * FURI_PX + 3 * GAP;
        const leftEdge = Math.max(0, (W - totalW) / 2);

        const col1MainCx = leftEdge + MAIN_PX / 2;
        const col1FuriCx = leftEdge + MAIN_PX + GAP + FURI_PX / 2;
        const col2MainCx = col1FuriCx + FURI_PX / 2 + GAP + MAIN_PX / 2;
        const col2FuriCx = col2MainCx + MAIN_PX / 2 + GAP + FURI_PX / 2;

        function drawCol(col, mainCx, furiCx, skipChars) {
            ctx.save();
            // skewY(-8deg) with pivot at the top-center of this column
            ctx.translate(mainCx, PAD_TOP);
            ctx.transform(1, SKEW, 0, 1, 0, 0);
            ctx.translate(-mainCx, -PAD_TOP);

            // Characters that rotate 90° in vertical Japanese text (OpenType vert)
            const VERT_ROTATE = new Set(['ー', '〜', '…', '―', '–', '—']);

            let y = PAD_TOP;
            for (let i = 0; i < col.chars.length; i++) {
                const char = col.chars[i];
                if (skipChars && skipChars.has(char)) { y += CHAR_STEP; continue; }
                ctx.font = MAIN_FONT;

                if (VERT_ROTATE.has(char)) {
                    // Rotate 90° around the character cell center so horizontal
                    // glyphs become vertical strokes.
                    ctx.save();
                    ctx.translate(mainCx, y + MAIN_PX * 0.5);
                    ctx.rotate(Math.PI / 2);
                    ctx.strokeText(char, 0, -MAIN_PX * 0.5);
                    ctx.restore();
                } else {
                    // 。 renders at the bottom of the canvas em-box (textBaseline='top'),
                    // but CSS vertical text repositions it to the top of the cell.
                    const drawY = char === '。' ? y - MAIN_PX * 0.62 : y;
                    if(char === '。') {
                        ctx.fillText(char, mainCx, drawY);
                    } else {
                        ctx.strokeText(char, mainCx, drawY);
                    }
                }

                const ruby = col.ruby[i];
                if (ruby) {
                    ctx.font = FURI_FONT;
                    const step = ruby.length * FURI_STEP > CHAR_STEP
                        ? (CHAR_STEP - 4) / ruby.length
                        : FURI_STEP;
                    const groupH = ruby.length * step;
                    const furiStartY = y + (CHAR_STEP - groupH) / 2;
                    for (let fi = 0; fi < ruby.length; fi++) {
                        ctx.fillText(ruby[fi], furiCx, furiStartY + fi * step);
                    }
                    ctx.font = MAIN_FONT;
                }
                y += CHAR_STEP;
            }
            ctx.restore();
        }

        const skip = skipPeriod ? new Set(['。']) : null;
        drawCol(COL1, col1MainCx, col1FuriCx, skip);
        drawCol(COL2, col2MainCx, col2FuriCx, null);

        // ── 2. Blur → smooth density gradient from glyph center outward ──────
        const bc = document.createElement('canvas');
        bc.width = W;
        bc.height = H;
        const bCtx = bc.getContext('2d');
        bCtx.filter = `blur(${BLUR}px)`;
        bCtx.drawImage(tc, 0, 0);

        // After blurring white-on-transparent: alpha channel = coverage/density.
        // R channel stays 255 wherever alpha>0 (premultiplied blur artefact),
        // so we sample alpha only.
        const pixels = bCtx.getImageData(0, 0, W, H).data;

        // ── 3. Draw halftone dots ─────────────────────────────────────────────
        if (!dc) {
            dc = document.createElement('canvas');
            dc.style.cssText =
                'position:absolute;right:0;top:0;' +
                'pointer-events:none;user-select:none;z-index:-1;opacity:0';
            document.body.appendChild(dc);
        }
        dc.width  = W;
        dc.height = H;
        const dCtx = dc.getContext('2d');
        dCtx.fillStyle = getComputedStyle(jpEl).color; // resolves var(--border)

        const MAX_R = GRID / 2 - 0.3; // largest dot radius (just under half grid)

        for (let row = 0; row * GRID <= H; row++) {
            const y    = row * GRID;
            const xOff = (row & 1) ? GRID * 0.5 : 0; // hex-grid row stagger
            for (let col = 0; ; col++) {
                const x = col * GRID + xOff;
                if (x > W + GRID) break;
                const sx  = Math.min(Math.round(x), W - 1);
                const sy  = Math.min(Math.round(y), H - 1);
                const idx = (sy * W + sx) * 4;
                const density = pixels[idx + 3] / 255; // 0=outside glyph, 1=center

                if (density > 0.01) {
                    const r = MAX_R * Math.min(density * 1.5, 1);
                    if (r > 0.25) {
                        dCtx.beginPath();
                        dCtx.arc(x, y, r, 0, Math.PI * 2);
                        dCtx.fill();
                    }
                }
            }
        }
    }

    const allChars = COL1.chars
        .concat(COL2.chars)
        .concat(Object.values(COL1.ruby).flat())
        .concat(Object.values(COL2.ruby).flat())
        .join('');

    document.fonts.load(MAIN_FONT, allChars).then(function () {
        render(false);
        requestAnimationFrame(function () {
            if (dc) dc.style.opacity = '0.4';
        });

        let t;
        window.addEventListener('resize', function () {
            clearTimeout(t);
            t = setTimeout(function () { render(false); }, 150);
        });

        function blinkPeriod() {
            render(true);
            setTimeout(function () { render(false); }, 180);
        }
        setTimeout(blinkPeriod, 800);
        setInterval(blinkPeriod, 2000);
    });
})();
