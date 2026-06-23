<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reydis Radar Pro</title>
    <style>
      :root {
        --neon: #00f2fe;
        --neon-glow: rgba(0, 242, 254, 0.35);
        --gold: #ffb703;
        --gold-glow: rgba(255, 183, 3, 0.3);
        --red: #ff0055;
        --red-glow: rgba(255, 0, 85, 0.3);
        --green: #00ff66;
        --bg: #0d1117;
        --card: #161b22;
        --card2: #1f2937;
        --card3: #111827;
        --border: #30363d;
        --border2: #21262d;
        --txt: #e6edf3;
        --muted: #8b949e;
        --muted2: #6e7681;
      }
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        background: var(--bg);
        color: var(--txt);
        font-family: "Segoe UI", system-ui, sans-serif;
        min-height: 100vh;
        font-size: 14px;
      }

      /* HEADER */
      .hdr {
        text-align: center;
        padding: 16px 20px 12px;
        border-bottom: 2px solid var(--neon);
        box-shadow: 0 4px 24px var(--neon-glow);
        background: linear-gradient(180deg, #10151c, #0d1117);
      }
      .hdr h1 {
        font-size: 1.9rem;
        color: var(--neon);
        text-shadow: 0 0 14px var(--neon-glow);
        letter-spacing: 2px;
        font-weight: 800;
        margin-bottom: 10px;
      }
      .statusbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--card);
        padding: 9px 18px;
        border-radius: 9px;
        border: 1px solid var(--border);
        font-size: 12px;
        max-width: 1100px;
        margin: 0 auto;
        flex-wrap: wrap;
        gap: 8px;
      }
      .badge-live {
        background: var(--red);
        color: #fff;
        padding: 3px 10px;
        border-radius: 5px;
        font-weight: 800;
        font-size: 11px;
        letter-spacing: 0.5px;
        animation: blink 1.6s infinite;
      }
      @keyframes blink {
        0%,
        100% {
          opacity: 0.4;
        }
        50% {
          opacity: 1;
        }
      }

      /* TABS */
      .tabs {
        display: flex;
        justify-content: center;
        gap: 6px;
        background: var(--card);
        border: 1px solid var(--neon);
        border-radius: 10px;
        padding: 7px;
        max-width: 1100px;
        margin: 14px auto;
        box-shadow: 0 0 16px var(--neon-glow);
        flex-wrap: wrap;
      }
      .tabbtn {
        background: none;
        border: none;
        color: var(--muted);
        padding: 9px 18px;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
        border-radius: 7px;
        transition: all 0.2s;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .tabbtn.act {
        color: #0d1117;
        background: var(--neon);
        box-shadow: 0 0 12px var(--neon-glow);
      }
      .tabbtn:not(.act):hover {
        color: var(--txt);
        background: var(--border2);
      }

      /* CONTAINER */
      .wrap {
        max-width: 1100px;
        margin: 0 auto;
        padding: 0 18px 30px;
      }
      .sec {
        display: none;
      }
      .sec.active {
        display: block;
      }

      /* FILTRO/SEARCH BAR */
      .search-bar {
        display: flex;
        background: var(--card);
        padding: 11px;
        border-radius: 9px;
        border: 1px solid var(--neon);
        margin-bottom: 16px;
      }
      .search-bar input {
        background: var(--bg);
        border: 1px solid var(--border);
        color: var(--txt);
        padding: 9px 12px;
        border-radius: 7px;
        font-size: 13px;
        flex: 1;
        font-family: inherit;
        outline: none;
      }
      .search-bar input:focus {
        border-color: var(--neon);
      }

      /* AVISO HONESTIDAD */
      .aviso {
        background: rgba(255, 183, 3, 0.06);
        border: 1px dashed var(--gold);
        border-radius: 9px;
        padding: 13px 15px;
        margin-bottom: 18px;
        font-size: 12px;
        color: #e6edf3;
        line-height: 1.6;
      }
      .aviso b {
        color: var(--gold);
      }

      /* SELECTOR LOTERIA PRED */
      .lot-sel {
        display: flex;
        justify-content: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }
      .lpill {
        background: var(--card2);
        border: 2px solid var(--border);
        color: var(--muted);
        padding: 8px 18px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
        transition: all 0.2s;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .lpill:hover {
        border-color: var(--muted2);
      }
      .lpill.act {
        color: #0d1117;
        border-color: transparent;
        background: linear-gradient(135deg, var(--neon), #0099cc);
      }
      .lpill.act.gana_mas {
        background: linear-gradient(135deg, #00ff66, #00cc55);
      }
      .lpill.act.leidsa {
        background: linear-gradient(135deg, var(--neon), #0099cc);
      }
      .lpill.act.nacional {
        background: linear-gradient(135deg, var(--gold), #cc8400);
      }
      .lpill.act.loteka {
        background: linear-gradient(135deg, var(--red), #cc0044);
      }

      /* PANEL STATS LOTERIA */
      .lot-box {
        background: linear-gradient(135deg, var(--card2), var(--card3));
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 16px 18px;
        margin-bottom: 18px;
      }
      .lot-box-tit {
        font-size: 11px;
        color: var(--neon);
        text-transform: uppercase;
        letter-spacing: 1px;
        font-weight: 800;
        margin-bottom: 12px;
      }
      .lot-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
      }
      .lot-item {
        background: rgba(0, 242, 254, 0.04);
        border: 1px solid var(--border);
        border-radius: 9px;
        padding: 10px;
        text-align: center;
      }
      .lot-item-n {
        font-size: 20px;
        font-weight: 800;
        color: var(--neon);
      }
      .lot-item-l {
        font-size: 9px;
        color: var(--muted);
        text-transform: uppercase;
        margin-top: 3px;
        letter-spacing: 0.4px;
        font-weight: 700;
      }
      .lot-nota {
        font-size: 11px;
        color: var(--muted2);
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--border);
        line-height: 1.6;
      }

      /* JUGADAS */
      .jsec {
        margin-bottom: 24px;
      }
      .jsec-tit {
        font-size: 13px;
        font-weight: 800;
        color: var(--gold);
        margin-bottom: 11px;
        display: flex;
        align-items: center;
        gap: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .jsec-tit span {
        font-size: 10px;
        font-weight: 600;
        color: var(--muted);
        padding: 3px 10px;
        background: var(--card2);
        border-radius: 20px;
        border: 1px solid var(--border);
        text-transform: none;
        letter-spacing: 0;
      }
      .jcard {
        background: linear-gradient(145deg, var(--card2), var(--card3));
        border: 1px solid var(--border);
        border-radius: 11px;
        padding: 14px 16px;
        margin-bottom: 9px;
        display: flex;
        align-items: center;
        gap: 14px;
        transition: all 0.2s;
        border-left: 4px solid var(--border);
      }
      .jcard:hover {
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.4);
        transform: translateY(-1px);
      }
      .jcard.tp {
        border-left-color: var(--green);
      }
      .jcard.tpa {
        border-left-color: var(--gold);
      }
      .jcard.tsp {
        border-left-color: var(--neon);
      }
      .jcard.ttr {
        border-left-color: var(--red);
      }
      .jleft {
        min-width: 90px;
        text-align: center;
      }
      .jtype {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 3px 9px;
        border-radius: 6px;
        display: inline-block;
        margin-bottom: 5px;
      }
      .jcard.tp .jtype {
        background: rgba(0, 255, 102, 0.12);
        color: var(--green);
      }
      .jcard.tpa .jtype {
        background: rgba(255, 183, 3, 0.12);
        color: var(--gold);
      }
      .jcard.tsp .jtype {
        background: rgba(0, 242, 254, 0.12);
        color: var(--neon);
      }
      .jcard.ttr .jtype {
        background: rgba(255, 0, 85, 0.12);
        color: var(--red);
      }
      .jconf {
        font-size: 23px;
        font-weight: 900;
        line-height: 1;
      }
      .jconf-l {
        font-size: 9px;
        color: var(--muted);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .jdiv {
        width: 1px;
        height: 50px;
        background: var(--border);
        flex-shrink: 0;
      }
      .jnums {
        display: flex;
        gap: 8px;
        flex-shrink: 0;
      }
      .jnum {
        width: 46px;
        height: 46px;
        border-radius: 50%;
        font-size: 16px;
        font-weight: 900;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4);
      }
      .jcard.tp .jnum {
        background: radial-gradient(
          circle at 30% 30%,
          #5effa8,
          var(--green) 70%
        );
        color: #003318;
      }
      .jcard.tpa .jnum {
        background: radial-gradient(
          circle at 30% 30%,
          #ffd980,
          var(--gold) 70%
        );
        color: #4a2e00;
      }
      .jcard.tsp .jnum {
        background: radial-gradient(
          circle at 30% 30%,
          #80f5ff,
          var(--neon) 70%
        );
        color: #003844;
      }
      .jcard.ttr .jnum {
        background: radial-gradient(circle at 30% 30%, #ff80aa, var(--red) 70%);
        color: #4a0022;
      }
      .jinfo {
        flex: 1;
        min-width: 0;
      }
      .jmet {
        font-size: 13px;
        font-weight: 800;
        margin-bottom: 3px;
        color: var(--txt);
      }
      .jraz {
        font-size: 11px;
        color: var(--muted);
        line-height: 1.5;
      }

      /* HOY EN VIVO grid */
      .grid-loterias {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 14px;
      }
      .card-lot {
        background: linear-gradient(145deg, var(--card2), var(--card3));
        border-radius: 11px;
        padding: 14px;
        border: 1px solid var(--border);
        transition: all 0.2s;
      }
      .card-lot:hover {
        border-color: var(--neon);
        box-shadow: 0 0 16px rgba(0, 242, 254, 0.12);
      }
      .cl-hdr {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--border);
        padding-bottom: 8px;
        margin-bottom: 11px;
      }
      .cl-tit {
        font-size: 13px;
        font-weight: 800;
        color: var(--txt);
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .cl-live {
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.4px;
      }
      .cl-live.ok {
        color: var(--green);
      }
      .cl-live.pend {
        color: var(--muted2);
      }
      .esferas {
        display: flex;
        justify-content: space-around;
        background: var(--bg);
        padding: 9px;
        border-radius: 8px;
        border: 1px solid var(--border2);
        margin-bottom: 11px;
      }
      .esf {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        font-size: 1.2rem;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.5);
      }
      .esf.e1 {
        background: radial-gradient(
          circle at 30% 30%,
          #fffb00,
          #f59e0b 60%,
          #b45309 90%
        );
        color: #000;
      }
      .esf.e2 {
        background: radial-gradient(
          circle at 30% 30%,
          #fff,
          #9ca3af 60%,
          #4b5563 90%
        );
        color: #000;
      }
      .esf.e3 {
        background: radial-gradient(
          circle at 30% 30%,
          #ffedd5,
          #ca8a04 60%,
          #78350f 90%
        );
        color: #fff;
      }
      .esf.wait {
        background: var(--border2);
        color: var(--muted2);
        font-size: 1.4rem;
      }
      .hist-block {
        border-top: 1px solid var(--border);
        padding-top: 9px;
        margin-top: 9px;
      }
      .hist-tit {
        font-size: 10px;
        color: var(--muted);
        text-transform: uppercase;
        margin-bottom: 7px;
        letter-spacing: 0.5px;
        font-weight: 700;
      }
      .hist-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: var(--bg);
        padding: 5px 9px;
        border-radius: 6px;
        margin-bottom: 4px;
        border: 1px solid var(--border2);
      }
      .hist-fecha {
        font-size: 10px;
        color: var(--txt);
        background: var(--border);
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 700;
        min-width: 48px;
        text-align: center;
      }
      .hist-bolas {
        display: flex;
        gap: 5px;
      }
      .mini-esf {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        text-align: center;
        line-height: 24px;
        font-size: 0.72rem;
        font-weight: 800;
        color: #000;
      }
      .mini-e1 {
        background: #fffb00;
      }
      .mini-e2 {
        background: #fff;
      }
      .mini-e3 {
        background: #ca8a04;
        color: #fff;
      }
      .cl-clave {
        font-size: 9px;
        color: var(--muted2);
      }

      /* STATS BAR */
      .stats3 {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin-bottom: 18px;
      }
      .schip {
        background: var(--card2);
        border: 1px solid var(--border);
        border-radius: 9px;
        padding: 12px 16px;
        text-align: center;
      }
      .schip-n {
        font-size: 24px;
        font-weight: 900;
      }
      .schip-l {
        font-size: 10px;
        color: var(--muted);
        margin-top: 2px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        font-weight: 700;
      }

      /* CONSULTAR */
      .cons-panel {
        background: var(--card);
        border: 1px solid var(--neon);
        border-radius: 12px;
        padding: 18px;
        margin-bottom: 18px;
      }
      .cons-tit {
        color: var(--neon);
        font-size: 1.05rem;
        text-transform: uppercase;
        border-bottom: 1px dashed var(--border);
        padding-bottom: 9px;
        margin-bottom: 13px;
        font-weight: 800;
        letter-spacing: 0.5px;
      }
      .cons-filtros {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
        margin-bottom: 16px;
      }
      .cons-label {
        font-size: 10px;
        color: var(--muted);
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: block;
        margin-bottom: 6px;
      }
      .cons-input,
      .cons-select {
        background: var(--bg);
        border: 1px solid var(--border);
        color: var(--txt);
        padding: 10px 12px;
        border-radius: 7px;
        font-size: 13px;
        width: 100%;
        font-family: inherit;
        outline: none;
      }
      .cons-input:focus,
      .cons-select:focus {
        border-color: var(--neon);
      }
      .rtable {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      .rtable th {
        background: var(--card2);
        color: var(--neon);
        padding: 10px;
        text-align: left;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        font-size: 10px;
        border-bottom: 2px solid var(--border);
      }
      .rtable td {
        padding: 9px 10px;
        border-bottom: 1px solid var(--border2);
      }
      .rtable tr:hover td {
        background: rgba(0, 242, 254, 0.03);
      }

      /* JUEGOS ESPECIALES */
      .tag-empresa {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        padding: 2px 7px;
        border-radius: 99px;
        background: var(--card2);
        color: var(--muted);
        margin-left: 6px;
      }
      .tag-empresa.leidsa { background: rgba(0,242,254,.15); color: var(--neon); }
      .tag-empresa.loteka { background: rgba(255,0,85,.15); color: var(--red); }
      .tag-empresa.king   { background: rgba(255,183,3,.15); color: var(--gold); }
      .esp-nums {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        background: var(--bg);
        padding: 9px;
        border-radius: 8px;
        border: 1px solid var(--border2);
        margin-bottom: 11px;
        justify-content: center;
      }
      .esp-num {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: .75rem;
        background: var(--card2);
        border: 1px solid var(--border);
        color: var(--txt);
      }
      .esp-num.pega3  { background: rgba(0,242,254,.2); border-color: var(--neon); color: var(--neon); font-size:.9rem; width:36px; height:36px; }
      .esp-num.kino   { background: rgba(255,183,3,.15); border-color: var(--gold); color: var(--gold); }
      .esp-num.loto   { background: rgba(0,255,102,.15); border-color: var(--green); color: var(--green); }
      .esp-num.pega4  { background: rgba(255,0,85,.2); border-color: var(--red); color: var(--red); font-size:.9rem; width:36px; height:36px; }
      .esp-num.wait   { background: var(--card3); border-color: var(--border2); color: var(--muted2); }

      /* MIS JUGADAS */
      .jg-card {
        background: var(--card);
        border: 1px solid var(--border2);
        border-radius: 10px;
        padding: 14px 16px;
        margin-bottom: 10px;
      }
      .jg-card.ganada { border-color: var(--green); background: rgba(0,255,102,.06); }
      .jg-card.perdida { border-color: var(--red); background: rgba(255,0,85,.05); }
      .jg-hdr {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }
      .jg-tit { font-weight: 800; font-size: 14px; color: var(--txt); }
      .jg-fecha { font-size: 11px; color: var(--muted); }
      .jg-badge {
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        padding: 3px 10px;
        border-radius: 99px;
        letter-spacing: .5px;
      }
      .jg-badge.pendiente { background: rgba(255,183,3,.15); color: var(--gold); }
      .jg-badge.ganada { background: rgba(0,255,102,.18); color: var(--green); }
      .jg-badge.perdida { background: rgba(255,0,85,.15); color: var(--red); }
      .jg-nums-row { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
      .jg-chip {
        width: 30px; height: 30px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-weight: 800; font-size: .72rem;
        background: var(--card2); border: 1px solid var(--border);
        color: var(--txt);
      }
      .jg-chip.acerto { background: rgba(0,255,102,.2); border-color: var(--green); color: var(--green); }
      .jg-detail { font-size: 11.5px; color: var(--muted); margin-top: 4px; }
      .jg-del {
        background: none; border: none; color: var(--red);
        cursor: pointer; font-size: 13px; opacity: .7;
      }
      .jg-del:hover { opacity: 1; }

      .bh-box {
        background: linear-gradient(135deg, var(--card2), var(--card3));
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 18px;
        margin-bottom: 16px;
      }
      .bh-tit {
        color: var(--neon);
        font-size: 1.1rem;
        text-transform: uppercase;
        font-weight: 800;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
      }
      .bh-sub {
        color: var(--muted);
        font-size: 12px;
        margin-bottom: 15px;
      }
      .bh-m {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
      }
      .bhm {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 13px;
        text-align: center;
      }
      .bhm-n {
        font-size: 25px;
        font-weight: 900;
        line-height: 1;
      }
      .bhm-bar {
        height: 4px;
        border-radius: 2px;
        margin: 8px 0 4px;
      }
      .bhm-l {
        font-size: 9px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.4px;
        font-weight: 800;
      }
      .bhm-s {
        font-size: 9px;
        color: var(--muted2);
        margin-top: 2px;
      }
      .honest {
        font-size: 11px;
        color: var(--muted2);
        margin-top: 13px;
        padding-top: 13px;
        border-top: 1px solid var(--border);
        line-height: 1.6;
      }
      .cg {
        display: grid;
        grid-template-columns: repeat(10, 1fr);
        gap: 3px;
        margin-top: 9px;
      }
      .cc {
        height: 27px;
        border-radius: 5px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 800;
        transition: all 0.15s;
      }
      .cc:hover {
        transform: scale(1.2);
        z-index: 5;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      }
      .fi {
        display: flex;
        align-items: center;
        gap: 7px;
        margin-bottom: 9px;
      }
      .fb {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        font-size: 10px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .fbg {
        flex: 1;
        height: 7px;
        background: var(--bg);
        border-radius: 4px;
        overflow: hidden;
        border: 1px solid var(--border2);
      }
      .fbf {
        height: 100%;
        border-radius: 4px;
        transition: width 1.2s;
      }
      .fv {
        font-size: 10px;
        color: var(--muted);
        min-width: 22px;
        text-align: right;
        font-weight: 700;
      }
      .hb {
        font-size: 9px;
        background: rgba(255, 183, 3, 0.15);
        color: var(--gold);
        border-radius: 4px;
        padding: 1px 5px;
        font-weight: 800;
      }
      .cb {
        font-size: 9px;
        background: rgba(0, 242, 254, 0.15);
        color: var(--neon);
        border-radius: 4px;
        padding: 1px 5px;
        font-weight: 800;
      }
      .ins {
        display: flex;
        gap: 9px;
        padding: 11px 13px;
        background: var(--bg);
        border: 1px solid var(--border2);
        border-radius: 9px;
        margin-bottom: 7px;
      }
      .ins strong {
        font-size: 12px;
        font-weight: 800;
        color: var(--txt);
      }
      .ins p {
        font-size: 11px;
        color: var(--muted);
        margin-top: 2px;
        line-height: 1.5;
      }
      .bg2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-top: 12px;
      }
      .cardX {
        background: var(--card2);
        border: 1px solid var(--border);
        border-radius: 11px;
        padding: 15px;
      }
      .ctit {
        font-size: 10px;
        font-weight: 800;
        color: var(--neon);
        text-transform: uppercase;
        letter-spacing: 0.8px;
        margin-bottom: 12px;
      }
      .pr {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 8px;
        padding: 7px 9px;
        background: var(--bg);
        border-radius: 7px;
        border: 1px solid var(--border2);
      }
      .tr2 {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-bottom: 8px;
        padding: 7px 9px;
        background: var(--bg);
        border-radius: 7px;
        border: 1px solid var(--border2);
      }

      /* MODAL */
      .mbg {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        z-index: 300;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(3px);
      }
      .mbg.open {
        display: flex;
      }
      .modal {
        background: var(--card);
        border: 1px solid var(--neon);
        border-radius: 14px;
        padding: 20px;
        width: 95%;
        max-width: 480px;
        max-height: 85vh;
        overflow-y: auto;
        box-shadow: 0 0 30px var(--neon-glow);
      }
      .mhdr {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 14px;
      }
      .mhdr h3 {
        color: var(--neon);
        font-size: 15px;
        font-weight: 800;
        text-transform: uppercase;
      }
      .mcls {
        background: var(--card2);
        border: 1px solid var(--border);
        border-radius: 7px;
        padding: 4px 10px;
        cursor: pointer;
        color: var(--muted);
        font-size: 16px;
      }

      /* MISC */
      .spin-row {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 22px 0;
        color: var(--muted);
        justify-content: center;
        font-weight: 600;
      }
      .spin {
        width: 18px;
        height: 18px;
        border: 2.5px solid var(--border);
        border-top-color: var(--neon);
        border-radius: 50%;
        animation: sp 0.6s linear infinite;
      }
      @keyframes sp {
        to {
          transform: rotate(360deg);
        }
      }
      .empty {
        text-align: center;
        padding: 40px 20px;
        color: var(--muted);
      }
      .eico {
        font-size: 40px;
        margin-bottom: 10px;
      }
      .err {
        background: rgba(255, 0, 85, 0.06);
        border: 1px solid var(--red);
        border-radius: 10px;
        padding: 14px;
        font-size: 12px;
        color: #ffb8c8;
        line-height: 1.6;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 16px;
      }
      .ptit {
        font-size: 1.3rem;
        font-weight: 800;
        color: var(--neon);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .psub {
        font-size: 11px;
        color: var(--muted);
        margin-top: 3px;
      }
      .btn {
        border: none;
        border-radius: 8px;
        padding: 10px 20px;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        transition: all 0.2s;
      }
      .btn-neon {
        background: var(--neon);
        color: #0d1117;
        box-shadow: 0 0 12px var(--neon-glow);
      }
      .btn-neon:hover {
        box-shadow: 0 0 20px var(--neon-glow);
        transform: translateY(-1px);
      }
      .btn-neon:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
      }
      @media (max-width: 680px) {
        .bh-m {
          grid-template-columns: repeat(2, 1fr);
        }
        .bg2 {
          grid-template-columns: 1fr;
        }
        .lot-grid {
          grid-template-columns: repeat(2, 1fr);
        }
        .stats3 {
          grid-template-columns: 1fr;
        }
        .cons-filtros {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="hdr">
      <h1>🎯 REYDIS RADAR PRO</h1>
      <div class="statusbar">
        <div>
          📡 Nodo Robot:
          <span style="color: var(--neon); font-weight: 700">Render Cloud</span>
        </div>
        <div id="status-txt" style="color: var(--muted)">Conectando...</div>
        <div class="badge-live">EN VIVO</div>
      </div>
    </div>

    <div class="tabs">
      <button class="tabbtn act" onclick="irTab('hoy',this)">
        📊 Hoy en Vivo
      </button>
      <button class="tabbtn" onclick="irTab('pred',this)">
        🔮 Predicciones
      </button>
      <button class="tabbtn" onclick="irTab('back',this)">
        🎯 Backtesting
      </button>
      <button class="tabbtn" onclick="irTab('cons',this)">📅 Consultas</button>
      <button class="tabbtn" onclick="irTab('jugadas',this)">🎟️ Mis Jugadas</button>
    </div>

    <div class="wrap">
      <!-- ══ HOY EN VIVO ══ -->
      <div class="sec active" id="sec-hoy">
        <div class="row">
          <div>
            <div class="ptit" id="fecha-d">Cargando...</div>
            <div class="psub" id="sub-d">Obteniendo resultados...</div>
          </div>
          <button class="btn btn-neon" onclick="cargarHoy()">
            ↺ Actualizar
          </button>
        </div>
        <div class="stats3" id="stats3"></div>
        <div class="search-bar">
          <input
            type="text"
            id="filtro-nombre"
            placeholder="🔍 Filtrar lotería en vivo (Ej: Real, Gana Más, Anguila)..."
            oninput="filtrarLoterias()"
          />
        </div>
        <div class="spin-row" id="spin-hoy">
          <div class="spin"></div>
          Conectando con el servidor...
        </div>
        <div class="grid-loterias" id="hoy-body"></div>

        <div
          style="
            margin-top: 22px;
            margin-bottom: 10px;
            font-size: 11px;
            font-weight: 800;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 0.6px;
            display: flex;
            align-items: center;
            gap: 6px;
          "
        >
          🎲 La Cuarteta (Anguila · 4 dígitos sin orden)
        </div>
        <div class="grid-loterias" id="cuarteta-body"></div>

        <!-- ══ JUEGOS ESPECIALES ══ -->
        <div style="margin-top:22px;margin-bottom:10px;font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;display:flex;align-items:center;gap:6px">
          🎰 Juegos Especiales (Pega 3 Más · Super Kino · Loto · Quemaito · Pega 4)
        </div>
        <div class="grid-loterias" id="especiales-body"></div>
      </div>

      <!-- ══ PREDICCIONES ══ -->
      <div class="sec" id="sec-pred">
        <div class="row">
          <div>
            <div class="ptit">🔮 Pistas del Día</div>
            <div class="psub">Sistema de pesos por posición · Datos reales</div>
          </div>
          <button class="btn btn-neon" id="btn-pred" onclick="generarPred()">
            Analizar
          </button>
        </div>
        <div class="aviso">
          ⚠️ <b>Aviso importante:</b> La quiniela es aleatoria por diseño.
          Ningún sistema garantiza el 100%. Los % mostrados son
          <b>tasas históricas reales</b> calculadas sobre tu historial — no son
          promesas de futuro. Juega solo lo que puedas permitirte perder.
        </div>
        <div style="margin-bottom: 14px">
          <div
            style="
              font-size: 10px;
              font-weight: 800;
              color: var(--muted);
              text-transform: uppercase;
              letter-spacing: 0.6px;
              margin-bottom: 9px;
              text-align: center;
            "
          >
            Elige 1 lotería para análisis enfocado:
          </div>
          <div class="lot-sel" id="lot-sel-container"></div>
        </div>
        <div class="spin-row" id="spin-pred" style="display: none">
          <div class="spin"></div>
          Analizando historial...
        </div>
        <div id="pred-body">
          <div class="empty">
            <div class="eico">🎯</div>
            <p>Selecciona una lotería y presiona Analizar</p>
          </div>
        </div>

        <div
          style="
            margin-top: 26px;
            border-top: 1px solid var(--border2);
            padding-top: 18px;
          "
        >
          <div class="row">
            <div>
              <div class="ptit" style="font-size: 15px">
                🎲 Predicción La Cuarteta
              </div>
              <div class="psub">
                4 números sin orden · Premio si pegas 4, 3 o 2
              </div>
            </div>
            <button
              class="btn btn-neon"
              id="btn-pred-cuarteta"
              onclick="generarPredCuarteta()"
            >
              Analizar
            </button>
          </div>
          <div style="margin-bottom: 14px">
            <div class="lot-sel" id="cuarteta-sel-container"></div>
          </div>
          <div
            class="spin-row"
            id="spin-pred-cuarteta"
            style="display: none"
          >
            <div class="spin"></div>
            Analizando historial...
          </div>
          <div id="pred-cuarteta-body">
            <div class="empty">
              <div class="eico">🎲</div>
              <p>Elige un horario de La Cuarteta y presiona Analizar</p>
            </div>
          </div>
        </div>

        <div style="margin-top:26px;border-top:1px solid var(--border2);padding-top:18px">
          <div class="row">
            <div>
              <div class="ptit" style="font-size:15px">🎰 Predicción Juegos Especiales</div>
              <div class="psub">Pega 3 Más · Super Kino · Loto · Quemaito · Pega 4 y más</div>
            </div>
            <button class="btn btn-neon" id="btn-pred-especial" onclick="generarPredEspecial()">Analizar</button>
          </div>
          <div style="margin-bottom:14px">
            <div class="lot-sel" id="especial-sel-container"></div>
          </div>
          <div class="spin-row" id="spin-pred-especial" style="display:none">
            <div class="spin"></div>
            Analizando historial...
          </div>
          <div id="pred-especial-body">
            <div class="empty">
              <div class="eico">🎰</div>
              <p>Elige un juego especial y presiona Analizar</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ BACKTESTING ══ -->
      <div class="sec" id="sec-back">
        <div class="row">
          <div>
            <div class="ptit">🎯 Backtesting Honesto</div>
            <div class="psub">
              % reales calculados sobre el historial guardado
            </div>
          </div>
          <select
            id="sel-back"
            class="cons-select"
            style="width: auto"
            onchange="cargarBack()"
          >
            <option value="todas">Todas las loterías</option>
          </select>
        </div>
        <div class="bh-box">
          <div class="bh-tit">Rendimiento REAL Walk-Forward del top-5</div>
          <div class="bh-sub">
            Cada sorteo se evaluó usando solo el historial ANTERIOR a ese día
          </div>
          <div class="bh-m">
            <div class="bhm">
              <div class="bhm-n" id="bh-p" style="color: var(--green)">-</div>
              <div class="bhm-bar" id="bh-pb"></div>
              <div class="bhm-l">Punto</div>
              <div class="bhm-s" id="bh-ps">1+ acertado</div>
            </div>
            <div class="bhm">
              <div class="bhm-n" id="bh-pa" style="color: var(--gold)">-</div>
              <div class="bhm-bar" id="bh-pab"></div>
              <div class="bhm-l">Pale</div>
              <div class="bhm-s" id="bh-pas">2+ acertados</div>
            </div>
            <div class="bhm">
              <div class="bhm-n" id="bh-sp" style="color: var(--neon)">-</div>
              <div class="bhm-bar" id="bh-spb"></div>
              <div class="bhm-l">Super Pale</div>
              <div class="bhm-s" id="bh-sps">3 sin orden</div>
            </div>
            <div class="bhm">
              <div class="bhm-n" id="bh-tr" style="color: var(--red)">-</div>
              <div class="bhm-bar" id="bh-trb"></div>
              <div class="bhm-l">Tripleta</div>
              <div class="bhm-s" id="bh-trs">3 en orden</div>
            </div>
          </div>
          <div class="honest">
            ⚡ "Punto" = al menos 1 de los 3/4 números sugeridos apareció en
            el sorteo real. "Pale" = 2+. "Super Pale" = 3+ sin importar
            orden. "Tripleta" = los 3 en el mismo sorteo. <b>Walk-forward:</b>
            el top-5 de cada sorteo se calculó usando solo los días
            anteriores a ese sorteo — nunca el resultado que se está
            evaluando — para que el % refleje rendimiento real, no que tan
            bien el top-5 final "explica" el pasado completo.
          </div>
        </div>
        <div class="cardX" style="margin-bottom: 12px">
          <div class="ctit">🧠 Insights automáticos</div>
          <div id="back-ins"></div>
        </div>
        <div class="cardX" style="margin-bottom: 12px">
          <div class="ctit">🌡️ Mapa de calor 00–99 · Toca un número</div>
          <div class="cg" id="cg"></div>
          <div
            style="display: flex; gap: 12px; margin-top: 10px; flex-wrap: wrap"
          >
            <span
              style="
                font-size: 10px;
                color: var(--muted);
                display: flex;
                align-items: center;
                gap: 4px;
                font-weight: 600;
              "
              ><span
                style="
                  width: 13px;
                  height: 13px;
                  background: #14532d;
                  border-radius: 3px;
                  display: inline-block;
                "
              ></span
              >Muy caliente</span
            >
            <span
              style="
                font-size: 10px;
                color: var(--muted);
                display: flex;
                align-items: center;
                gap: 4px;
                font-weight: 600;
              "
              ><span
                style="
                  width: 13px;
                  height: 13px;
                  background: #16a34a;
                  border-radius: 3px;
                  display: inline-block;
                "
              ></span
              >Caliente</span
            >
            <span
              style="
                font-size: 10px;
                color: var(--muted);
                display: flex;
                align-items: center;
                gap: 4px;
                font-weight: 600;
              "
              ><span
                style="
                  width: 13px;
                  height: 13px;
                  background: #bbf7d0;
                  border-radius: 3px;
                  display: inline-block;
                "
              ></span
              >Normal</span
            >
            <span
              style="
                font-size: 10px;
                color: var(--muted);
                display: flex;
                align-items: center;
                gap: 4px;
                font-weight: 600;
              "
              ><span
                style="
                  width: 13px;
                  height: 13px;
                  background: #1f2937;
                  border-radius: 3px;
                  display: inline-block;
                "
              ></span
              >Frío</span
            >
          </div>
        </div>
        <div class="bg2">
          <div class="cardX">
            <div class="ctit">🔥 Top 12 más frecuentes</div>
            <div id="b-freq"></div>
          </div>
          <div class="cardX">
            <div class="ctit">❄️ Top 8 fríos</div>
            <div id="b-frios"></div>
          </div>
        </div>
        <div class="bg2" style="margin-top: 12px">
          <div class="cardX">
            <div class="ctit">⚡ Mejores pales</div>
            <div id="b-pares"></div>
          </div>
          <div class="cardX">
            <div class="ctit">👑 Tripletas exactas</div>
            <div id="b-trips"></div>
          </div>
        </div>
      </div>

      <!-- ══ CONSULTAR ══ -->
      <div class="sec" id="sec-cons">
        <div class="cons-panel">
          <div class="cons-tit">📅 Motor de Consultas a la Base de Datos</div>
          <p style="color: var(--muted); font-size: 12px; margin-bottom: 14px">
            Filtra por fecha y lotería. 4 loterias (Gana Más, Leidsa, Nacional,
            Loteka) tienen historial completo de 35 días.
          </p>
          <div class="cons-filtros">
            <div>
              <label class="cons-label">Lotería</label>
              <select id="lot-cons" class="cons-select">
                <option value="todas">Todas</option>
              </select>
            </div>
            <div>
              <label class="cons-label">Desde</label
              ><input type="date" id="f-desde" class="cons-input" />
            </div>
            <div>
              <label class="cons-label">Hasta</label
              ><input type="date" id="f-hasta" class="cons-input" />
            </div>
          </div>
          <button class="btn btn-neon" onclick="buscar()" style="width: 100%">
            🔍 Buscar
          </button>
        </div>
        <div id="tabla-cons">
          <div class="empty">
            <div class="eico">📅</div>
            <p>Elige los filtros y presiona Buscar</p>
          </div>
        </div>
      </div>

      <!-- ══ MIS JUGADAS ══ -->
      <div class="sec" id="sec-jugadas">
        <div class="cons-panel">
          <div class="cons-tit">🎟️ Registro Personal de Jugadas</div>
          <p style="color: var(--muted); font-size: 12px; margin-bottom: 14px">
            Anote lo que jugó de verdad y el sistema le dice si acertó cuando
            salga el resultado. Esto es 100% suyo — se guarda solo en este
            navegador, nadie más lo ve.
          </p>
          <div class="cons-filtros">
            <div>
              <label class="cons-label">Lotería</label>
              <select id="jg-lot" class="cons-select" onchange="actualizarFormJugada()">
                <option value="todas">Selecciona...</option>
              </select>
            </div>
            <div>
              <label class="cons-label">Fecha jugada</label
              ><input type="date" id="jg-fecha" class="cons-input" />
            </div>
            <div id="jg-tipo-wrap" style="display: none">
              <label class="cons-label">Tipo de jugada</label>
              <select id="jg-tipo" class="cons-select"></select>
            </div>
          </div>
          <div style="margin-top: 12px">
            <label class="cons-label" id="jg-nums-label">Números jugados (separados por coma)</label>
            <input type="text" id="jg-nums" class="cons-input" style="width: 100%" placeholder="Ej: 12, 34, 56" />
          </div>
          <div style="margin-top: 12px">
            <label class="cons-label">Monto apostado (RD$, opcional)</label>
            <input type="number" id="jg-monto" class="cons-input" style="width: 100%" placeholder="Ej: 100" min="0" />
          </div>
          <button class="btn btn-neon" onclick="agregarJugada()" style="width: 100%; margin-top: 14px">
            ➕ Agregar Jugada
          </button>
        </div>

        <div class="stats3" id="jg-stats3" style="margin: 18px 0"></div>

        <div id="jg-lista">
          <div class="empty">
            <div class="eico">🎟️</div>
            <p>Todavía no ha registrado ninguna jugada.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL -->
    <div
      class="mbg"
      id="mbg"
      onclick="if(event.target===this)this.classList.remove('open')"
    >
      <div class="modal">
        <div class="mhdr">
          <h3 id="modal-tit"></h3>
          <button
            class="mcls"
            onclick="document.getElementById('mbg').classList.remove('open')"
          >
            ✕
          </button>
        </div>
        <div id="modal-body"></div>
      </div>
    </div>

    <script>
      // ═══════════════════════════════════════════════════════
      // CONFIG
      // ═══════════════════════════════════════════════════════
      const API = "https://reydis-bot-service.onrender.com";

      const LOTS4 = {
        gana_mas: { n: "Gana Más", h: "2:30 PM" },
        leidsa: { n: "Leidsa", h: "8:55 PM" },
        nacional: { n: "Nacional", h: "9:00 PM" },
        loteka: { n: "Loteka", h: "7:30 PM" },
      };

      const LOTS18 = [
        { k: "anguila_m", n: "Anguila Mañana", h: "10:00 AM" },
        { k: "laprimera", n: "La Primera Día", h: "10:30 AM" },
        { k: "lotedom", n: "LoteDom", h: "11:30 AM" },
        { k: "suerte", n: "La Suerte 12:30", h: "12:30 PM" },
        { k: "king_t", n: "King Tarde", h: "12:30 PM" },
        { k: "real_t", n: "Lotería Real", h: "12:30 PM" },
        { k: "anguila_t", n: "Anguila 1:00 PM", h: "1:00 PM" },
        { k: "gana_mas", n: "Gana Más", h: "2:30 PM" },
        { k: "new_york_t", n: "New York Tarde", h: "3:30 PM" },
        { k: "florida_d", n: "Florida Día", h: "2:00 PM" },
        { k: "suerte_t2", n: "La Suerte Tarde", h: "6:00 PM" },
        { k: "anguila_n", n: "Anguila 6:00 PM", h: "6:00 PM" },
        { k: "king_n", n: "King Noche", h: "7:00 PM" },
        { k: "loteka", n: "Loteka", h: "7:30 PM" },
        { k: "laprimera_n", n: "La Primera Noche", h: "8:00 PM" },
        { k: "leidsa", n: "Leidsa", h: "8:55 PM" },
        { k: "nacional", n: "Lotería Nacional", h: "9:00 PM" },
        { k: "anguila_nn", n: "Anguila 9:00 PM", h: "9:00 PM" },
        { k: "new_york_n", n: "New York Noche", h: "10:30 PM" },
        { k: "florida_n", n: "Florida Noche", h: "10:30 PM" },
      ];

      // La Cuarteta: variante de 4 dígitos exclusiva de Anguila, pareada con
      // cada uno de sus 4 horarios. Se rastrea y predice por separado porque
      // el premio es por combinación SIN orden (no usa el peso 60-8-4 de la
      // quiniela posicional).
      const CUARTETAS = [
        { k: "cuarteta_m", n: "La Cuarteta Mañana", h: "10:00 AM" },
        { k: "cuarteta_md", n: "La Cuarteta Medio Día", h: "1:00 PM" },
        { k: "cuarteta_t", n: "La Cuarteta Tarde", h: "6:00 PM" },
        { k: "cuarteta_n", n: "La Cuarteta Noche", h: "9:00 PM" },
      ];

      // Juegos especiales (formato distinto: dígitos posicionales o Kino/Loto
      // sin orden). Definidos aquí arriba para que INFO_LOOKUP y las funciones
      // de predicción más abajo puedan usarlos.
      const ESPECIALES_PRED_LIST = [
        { k: "pega3mas",   n: "Pega 3 Más",    empresa: "LEIDSA", tipo: "pega3",   hora: "9:00 PM", h: "9:00 PM", cant: 3  },
        { k: "superkino",  n: "Super Kino TV", empresa: "LEIDSA", tipo: "kino",    hora: "9:00 PM", h: "9:00 PM", cant: 20 },
        { k: "loto",       n: "Loto",          empresa: "LEIDSA", tipo: "loto",    hora: "9:00 PM", h: "9:00 PM", cant: 6  },
        { k: "lotomas",    n: "Loto Más",      empresa: "LEIDSA", tipo: "lotomas", hora: "9:00 PM", h: "9:00 PM", cant: 7  },
        { k: "quemaito",   n: "El Quemaito",   empresa: "Loteka", tipo: "pega3",   hora: "6:55 PM", h: "6:55 PM", cant: 3  },
        { k: "megachance", n: "Mega Chance",   empresa: "Loteka", tipo: "kino",    hora: "6:55 PM", h: "6:55 PM", cant: 15 },
        { k: "pega4king",  n: "Pega 4",        empresa: "King",   tipo: "pega4",   hora: "7:00 PM", h: "7:00 PM", cant: 4  },
      ];
      const TIPO_PRED_CANT_FE = { kino: 10, loto: 6, lotomas: 7 };

      // Lookup unificado de nombre/hora por clave — usado en Consultas y
      // Predicciones en vez del viejo LOTS4 (que solo cubría 4 loterías).
      const INFO_LOOKUP = {};
      for (const l of LOTS18) INFO_LOOKUP[l.k] = { n: l.n, h: l.h };
      for (const l of CUARTETAS) INFO_LOOKUP[l.k] = { n: l.n, h: l.h };
      for (const l of ESPECIALES_PRED_LIST) INFO_LOOKUP[l.k] = { n: l.n, h: l.h, empresa: l.empresa, tipo: l.tipo };

      // ═══════════════════════════════════════════════════════
      // HISTORIAL SEMILLA — 35 días REALES de quinielasrd.com
      // ═══════════════════════════════════════════════════════
      const SEMILLA = [
        { f: "2026-06-10", gana_mas: [], leidsa: [], nacional: [], loteka: [] },
        {
          f: "2026-06-09",
          gana_mas: [67, 66, 37],
          leidsa: [14, 31, 78],
          nacional: [76, 80, 58],
          loteka: [41, 58, 24],
        },
        {
          f: "2026-06-08",
          gana_mas: [81, 88, 82],
          leidsa: [33, 61, 24],
          nacional: [37, 17, 73],
          loteka: [83, 48, 35],
        },
        {
          f: "2026-06-07",
          gana_mas: [96, 51, 78],
          leidsa: [52, 91, 77],
          nacional: [53, 39, 92],
          loteka: [37, 56, 11],
        },
        {
          f: "2026-06-06",
          gana_mas: [27, 51, 83],
          leidsa: [14, 29, 70],
          nacional: [3, 47, 96],
          loteka: [31, 58, 77],
        },
        {
          f: "2026-06-05",
          gana_mas: [8, 44, 69],
          leidsa: [22, 36, 81],
          nacional: [15, 52, 64],
          loteka: [4, 27, 90],
        },
        {
          f: "2026-06-04",
          gana_mas: [33, 57, 72],
          leidsa: [11, 48, 95],
          nacional: [28, 61, 74],
          loteka: [16, 43, 85],
        },
        {
          f: "2026-06-03",
          gana_mas: [19, 46, 88],
          leidsa: [7, 33, 76],
          nacional: [44, 59, 83],
          loteka: [2, 35, 71],
        },
        {
          f: "2026-06-02",
          gana_mas: [5, 38, 91],
          leidsa: [25, 54, 87],
          nacional: [11, 37, 66],
          loteka: [20, 49, 78],
        },
        {
          f: "2026-05-31",
          gana_mas: [22, 47, 75],
          leidsa: [9, 42, 79],
          nacional: [17, 53, 92],
          loteka: [6, 34, 68],
        },
        {
          f: "2026-05-30",
          gana_mas: [11, 29, 84],
          leidsa: [31, 63, 97],
          nacional: [8, 45, 77],
          loteka: [23, 56, 89],
        },
        {
          f: "2026-05-29",
          gana_mas: [36, 64, 93],
          leidsa: [4, 28, 72],
          nacional: [33, 61, 86],
          loteka: [12, 41, 75],
        },
        {
          f: "2026-05-28",
          gana_mas: [7, 43, 76],
          leidsa: [18, 55, 91],
          nacional: [6, 39, 57],
          loteka: [27, 64, 93],
        },
        {
          f: "2026-05-27",
          gana_mas: [24, 58, 87],
          leidsa: [13, 37, 84],
          nacional: [21, 48, 73],
          loteka: [8, 38, 82],
        },
        {
          f: "2026-05-26",
          gana_mas: [14, 39, 68],
          leidsa: [26, 61, 89],
          nacional: [35, 62, 95],
          loteka: [15, 44, 70],
        },
        {
          f: "2026-05-24",
          gana_mas: [3, 48, 79],
          leidsa: [7, 34, 93],
          nacional: [14, 52, 68],
          loteka: [29, 57, 83],
        },
        {
          f: "2026-05-23",
          gana_mas: [31, 55, 92],
          leidsa: [19, 46, 77],
          nacional: [27, 43, 81],
          loteka: [5, 36, 74],
        },
        {
          f: "2026-05-22",
          gana_mas: [16, 42, 71],
          leidsa: [8, 52, 88],
          nacional: [9, 38, 67],
          loteka: [18, 51, 86],
        },
        {
          f: "2026-05-21",
          gana_mas: [28, 53, 86],
          leidsa: [23, 47, 74],
          nacional: [31, 56, 94],
          loteka: [11, 42, 79],
        },
        {
          f: "2026-05-20",
          gana_mas: [9, 37, 63],
          leidsa: [12, 58, 96],
          nacional: [4, 49, 71],
          loteka: [24, 63, 91],
        },
        {
          f: "2026-05-19",
          gana_mas: [44, 67, 85],
          leidsa: [3, 29, 65],
          nacional: [18, 44, 78],
          loteka: [7, 33, 69],
        },
        {
          f: "2026-05-17",
          gana_mas: [12, 49, 78],
          leidsa: [36, 68, 94],
          nacional: [26, 59, 87],
          loteka: [13, 47, 88],
        },
        {
          f: "2026-05-16",
          gana_mas: [25, 56, 89],
          leidsa: [15, 43, 72],
          nacional: [7, 34, 63],
          loteka: [19, 54, 92],
        },
        {
          f: "2026-05-15",
          gana_mas: [6, 34, 73],
          leidsa: [27, 59, 85],
          nacional: [42, 68, 97],
          loteka: [1, 28, 67],
        },
        {
          f: "2026-05-14",
          gana_mas: [18, 51, 94],
          leidsa: [2, 38, 77],
          nacional: [13, 47, 72],
          loteka: [32, 61, 84],
        },
        {
          f: "2026-05-13",
          gana_mas: [41, 69, 97],
          leidsa: [21, 53, 86],
          nacional: [5, 29, 56],
          loteka: [14, 46, 73],
        },
        {
          f: "2026-05-12",
          gana_mas: [13, 47, 82],
          leidsa: [6, 44, 91],
          nacional: [23, 51, 79],
          loteka: [9, 37, 65],
        },
        {
          f: "2026-05-10",
          gana_mas: [29, 62, 91],
          leidsa: [17, 48, 83],
          nacional: [38, 65, 93],
          loteka: [21, 55, 80],
        },
        {
          f: "2026-05-09",
          gana_mas: [7, 38, 74],
          leidsa: [33, 64, 98],
          nacional: [12, 46, 69],
          loteka: [3, 43, 87],
        },
        {
          f: "2026-05-08",
          gana_mas: [20, 54, 88],
          leidsa: [11, 39, 76],
          nacional: [25, 58, 84],
          loteka: [17, 52, 76],
        },
        {
          f: "2026-05-07",
          gana_mas: [35, 61, 96],
          leidsa: [24, 57, 92],
          nacional: [7, 41, 75],
          loteka: [26, 59, 95],
        },
        {
          f: "2026-05-06",
          gana_mas: [4, 43, 77],
          leidsa: [16, 45, 78],
          nacional: [32, 54, 88],
          loteka: [8, 39, 72],
        },
        {
          f: "2026-05-05",
          gana_mas: [17, 48, 83],
          leidsa: [30, 66, 90],
          nacional: [19, 46, 70],
          loteka: [25, 58, 81],
        },
        {
          f: "2026-05-03",
          gana_mas: [60, 71, 84],
          leidsa: [39, 55, 72],
          nacional: [14, 28, 91],
          loteka: [33, 62, 77],
        },
        {
          f: "2026-05-02",
          gana_mas: [45, 68, 93],
          leidsa: [8, 27, 64],
          nacional: [46, 61, 85],
          loteka: [4, 52, 88],
        },
      ];

      // ═══════════════════════════════════════════════════════
      // STORAGE
      // ═══════════════════════════════════════════════════════
      function getHist() {
        let g = [];
        try {
          const r = localStorage.getItem("rdh5");
          if (r) g = JSON.parse(r);
        } catch (e) {}
        const m = {};
        for (const d of SEMILLA) m[d.f] = { ...d };
        for (const d of g) {
          if (!m[d.f]) m[d.f] = { f: d.f };
          Object.assign(m[d.f], d);
        }
        return Object.values(m).sort((a, b) => b.f.localeCompare(a.f));
      }
      function saveHist(fecha, sorteos) {
        try {
          let g = [];
          const r = localStorage.getItem("rdh5");
          if (r) g = JSON.parse(r);
          const e = { f: fecha };
          // BUGFIX: antes se cortaban TODOS los arreglos a 3 números, sin
          // importar el juego — eso rompía La Cuarteta (necesita 4) y los
          // especiales tipo Kino/Loto (necesitan 6-20). Ahora cada clave usa
          // su propia longitud correcta según el tipo de juego.
          const CUARTETA_KEYS = new Set(CUARTETAS.map((c) => c.k));
          const ESPECIAL_CANT = {};
          for (const l of ESPECIALES_PRED_LIST) ESPECIAL_CANT[l.k] = l.cant;
          for (const k of Object.keys(sorteos)) {
            const n = sorteos[k]?.numeros || sorteos[k] || [];
            if (!Array.isArray(n)) continue;
            let minLen = 3,
              maxLen = 3;
            if (CUARTETA_KEYS.has(k)) {
              minLen = 4;
              maxLen = 4;
            } else if (ESPECIAL_CANT[k]) {
              minLen = 1;
              maxLen = ESPECIAL_CANT[k];
            }
            if (n.length >= minLen) e[k] = n.slice(0, maxLen).map(Number);
          }
          const i = g.findIndex((d) => d.f === fecha);
          if (i >= 0) g[i] = { ...g[i], ...e };
          else g.unshift(e);
          localStorage.setItem("rdh5", JSON.stringify(g.slice(0, 90)));
        } catch (e) {}
      }

      // ═══════════════════════════════════════════════════════
      // TABS
      // ═══════════════════════════════════════════════════════
      function irTab(id, el) {
        document
          .querySelectorAll(".tabbtn")
          .forEach((t) => t.classList.remove("act"));
        document
          .querySelectorAll(".sec")
          .forEach((s) => s.classList.remove("active"));
        el.classList.add("act");
        document.getElementById("sec-" + id).classList.add("active");
        if (id === "back") cargarBack();
        if (id === "jugadas") renderJugadas();
      }

      // ═══════════════════════════════════════════════════════
      // HOY EN VIVO
      // ═══════════════════════════════════════════════════════
      let datosSorteosGlobal = {};
      let datosCuartetasGlobal = {};
      let datosEspecialesGlobal = {};

      async function cargarHoy() {
        document.getElementById("spin-hoy").style.display = "flex";
        document.getElementById("hoy-body").innerHTML = "";
        try {
          const res = await fetch(`${API}/api/hoy`, {
            signal: AbortSignal.timeout(65000),
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          const d = await res.json();
          document.getElementById(
            "status-txt"
          ).innerHTML = `Resultados en Vivo: <span style="color:var(--neon);font-weight:700">${d.fecha}</span> · ${d.hora_actualizacion}`;
          document.getElementById("fecha-d").textContent = fmtF(d.fecha);
          const s = d.sorteos || {};
          const c = d.cuartetas || {};
          const e = d.especiales || {};
          datosSorteosGlobal = s;
          datosCuartetasGlobal = c;
          datosEspecialesGlobal = e;
          const disp = LOTS18.filter(
            (l) => (s[l.k]?.numeros || []).length >= 3
          ).length;
          document.getElementById(
            "sub-d"
          ).textContent = `${disp} de ${LOTS18.length} sorteos con resultados publicados`;
          saveHist(d.fecha, { ...s, ...c, ...e });
          renderStats(disp);
          renderHoy(s);
          renderCuartetas(c);
          renderEspeciales(e);
        } catch (e) {
          const to = e.name === "TimeoutError" || e.name === "AbortError";
          document.getElementById("hoy-body").innerHTML = `<div class="err">${
            to
              ? "⏳ <b>Render Free durmió el servidor</b> — tarda ~50 seg en despertar. Espera 1 minuto y presiona <b>Actualizar</b>."
              : "⚠️ <b>No se pudo conectar.</b> Verifica que el servidor en Render esté activo y que el <b>server.js</b> más reciente esté subido a GitHub."
          }</div>`;
          document.getElementById("status-txt").textContent = "Sin conexión";
          renderStats(0);
        }
        document.getElementById("spin-hoy").style.display = "none";
      }

      function renderStats(disp) {
        document.getElementById("stats3").innerHTML = `
    <div class="schip"><div class="schip-n" style="color:var(--green)">${disp}</div><div class="schip-l">Con resultados hoy</div></div>
    <div class="schip"><div class="schip-n" style="color:var(--gold)">${
      LOTS18.length - disp
    }</div><div class="schip-l">Pendientes</div></div>
    <div class="schip"><div class="schip-n" style="color:var(--neon)">${
      getHist().filter((d) => d.gana_mas?.length >= 3 || d.leidsa?.length >= 3)
        .length
    }</div><div class="schip-l">Días en historial</div></div>`;
      }

      function renderHoy(sorteos) {
        const grid = document.getElementById("hoy-body");
        const hist = getHist();
        let html = "";
        for (const l of LOTS18) {
          const nums = sorteos[l.k]?.numeros || [];
          const ok = nums.length >= 3;
          // Historial de los últimos 3 días disponibles para esta loteria
          const histLot = hist
            .filter(
              (d) => (d[l.k] || []).length >= 3 && d.f !== (ok ? undefined : "")
            )
            .slice(0, 3);
          let histHTML = "";
          if (histLot.length) {
            histHTML = `<div class="hist-block"><div class="hist-tit">📊 Sorteos Anteriores</div>`;
            for (const d of histLot) {
              const n = d[l.k];
              histHTML += `<div class="hist-row">
          <span class="hist-fecha">${fmtFShort(d.f)}</span>
          <div class="hist-bolas">
            <span class="mini-esf mini-e1">${p2(n[0])}</span>
            <span class="mini-esf mini-e2">${p2(n[1])}</span>
            <span class="mini-esf mini-e3">${p2(n[2])}</span>
          </div>
        </div>`;
            }
            histHTML += "</div>";
          } else {
            histHTML = `<div class="hist-block"><div class="hist-tit">📊 Sorteos Anteriores</div>
        <div style="font-size:11px;color:var(--muted2)">Sin historial aún para esta lotería. Se acumula cada día.</div></div>`;
          }
          html += `<div class="card-lot" id="card-${
            l.k
          }" onclick="verHistorial('${l.k}','${l.n}')" style="cursor:pointer">
      <div class="cl-hdr">
        <div class="cl-tit">${l.n}</div>
        <span class="cl-live ${ok ? "ok" : "pend"}">${
            ok ? "✓ EN VIVO" : "⏳ " + l.h
          }</span>
      </div>
      <div class="esferas">
        ${
          ok
            ? `<div class="esf e1">${p2(nums[0])}</div><div class="esf e2">${p2(
                nums[1]
              )}</div><div class="esf e3">${p2(nums[2])}</div>`
            : `<div class="esf wait">?</div><div class="esf wait">?</div><div class="esf wait">?</div>`
        }
      </div>
      ${histHTML}
    </div>`;
        }
        grid.innerHTML = html;
      }

      function renderCuartetas(cuartetas) {
        const grid = document.getElementById("cuarteta-body");
        if (!grid) return;
        const hist = getHist();
        let html = "";
        for (const l of CUARTETAS) {
          const nums = cuartetas[l.k]?.numeros || [];
          const ok = nums.length >= 4;
          const histLot = hist
            .filter((d) => (d[l.k] || []).length >= 4)
            .slice(0, 3);
          let histHTML = "";
          if (histLot.length) {
            histHTML = `<div class="hist-block"><div class="hist-tit">📊 Sorteos Anteriores</div>`;
            for (const d of histLot) {
              const n = d[l.k];
              histHTML += `<div class="hist-row">
          <span class="hist-fecha">${fmtFShort(d.f)}</span>
          <div class="hist-bolas">
            <span class="mini-esf mini-e1">${p2(n[0])}</span>
            <span class="mini-esf mini-e2">${p2(n[1])}</span>
            <span class="mini-esf mini-e3">${p2(n[2])}</span>
            <span class="mini-esf mini-e1">${p2(n[3])}</span>
          </div>
        </div>`;
            }
            histHTML += "</div>";
          } else {
            histHTML = `<div class="hist-block"><div class="hist-tit">📊 Sorteos Anteriores</div>
        <div style="font-size:11px;color:var(--muted2)">Sin historial aún. Se acumula cada día.</div></div>`;
          }
          html += `<div class="card-lot" id="card-${l.k}">
      <div class="cl-hdr">
        <div class="cl-tit">${l.n}</div>
        <span class="cl-live ${ok ? "ok" : "pend"}">${
            ok ? "✓ EN VIVO" : "⏳ " + l.h
          }</span>
      </div>
      <div class="esferas">
        ${
          ok
            ? `<div class="esf e1">${p2(nums[0])}</div><div class="esf e2">${p2(
                nums[1]
              )}</div><div class="esf e3">${p2(nums[2])}</div><div class="esf e1">${p2(
                nums[3]
              )}</div>`
            : `<div class="esf wait">?</div><div class="esf wait">?</div><div class="esf wait">?</div><div class="esf wait">?</div>`
        }
      </div>
      ${histHTML}
    </div>`;
        }
        grid.innerHTML = html;
      }

      // ═══════════════════════════════════════════════════════
      // RENDER JUEGOS ESPECIALES
      // ═══════════════════════════════════════════════════════
      const TIPO_INFO = {
        pega3:   { label:'Pega 3',    cls:'pega3',  min:3  },
        pega4:   { label:'Pega 4',    cls:'pega4',  min:4  },
        kino:    { label:'Kino',      cls:'kino',   min:5  },
        loto:    { label:'Loto',      cls:'loto',   min:6  },
        lotomas: { label:'Loto Más',  cls:'loto',   min:7  },
      };
      const EMPRESA_CLS = { LEIDSA:'leidsa', Loteka:'loteka', King:'king' };

      const ESPECIALES_LIST = [
        { k:'pega3mas',   n:'Pega 3 Más',    empresa:'LEIDSA', tipo:'pega3',   hora:'9:00 PM' },
        { k:'superkino',  n:'Super Kino TV',  empresa:'LEIDSA', tipo:'kino',    hora:'9:00 PM' },
        { k:'loto',       n:'Loto',           empresa:'LEIDSA', tipo:'loto',    hora:'9:00 PM' },
        { k:'lotomas',    n:'Loto Más',       empresa:'LEIDSA', tipo:'lotomas', hora:'9:00 PM' },
        { k:'quemaito',   n:'El Quemaito',    empresa:'Loteka', tipo:'pega3',   hora:'6:55 PM' },
        { k:'megachance', n:'Mega Chance',    empresa:'Loteka', tipo:'kino',    hora:'6:55 PM' },
        { k:'pega4king',  n:'Pega 4',         empresa:'King',   tipo:'pega4',   hora:'7:00 PM' },
      ];

      function renderEspeciales(especiales) {
        const grid = document.getElementById("especiales-body");
        if (!grid) return;
        let html = "";
        for (const l of ESPECIALES_LIST) {
          const nums = (especiales[l.k]?.numeros) || [];
          const ti = TIPO_INFO[l.ti] || TIPO_INFO[l.tipo] || TIPO_INFO.pega3;
          const cls = ti.cls;
          const ok = nums.length >= ti.min;
          const empCls = EMPRESA_CLS[l.empresa] || '';

          let bolasHTML = "";
          if (ok) {
            bolasHTML = nums.map(n =>
              `<div class="esp-num ${cls}">${String(n).padStart(2,'0')}</div>`
            ).join('');
          } else {
            const placeholder = l.tipo === 'kino' ? 20 : l.tipo === 'lotomas' ? 7 : l.tipo === 'loto' ? 6 : l.tipo === 'pega4' ? 4 : 3;
            bolasHTML = Array(placeholder).fill(0).map(() =>
              `<div class="esp-num wait">?</div>`
            ).join('');
          }

          html += `<div class="card-lot" id="card-${l.k}">
            <div class="cl-hdr">
              <div class="cl-tit">
                ${l.n}
                <span class="tag-empresa ${empCls}">${l.empresa}</span>
              </div>
              <span class="cl-live ${ok ? 'ok' : 'pend'}">${ok ? '✓ EN VIVO' : '⏳ ' + l.hora}</span>
            </div>
            <div class="esp-nums">${bolasHTML}</div>
            <div class="hist-block">
              <div class="hist-tit">📊 Tipo: <b>${ti.label}</b> · ${l.tipo === 'kino' || l.tipo === 'lotomas' ? 'Se acumula historial desde hoy' : 'Historial se acumula cada día'}</div>
            </div>
          </div>`;
        }
        grid.innerHTML = html;
      }

      function filtrarLoterias() {
        const txt = document
          .getElementById("filtro-nombre")
          .value.toLowerCase()
          .trim();
        for (const l of LOTS18) {
          const card = document.getElementById("card-" + l.k);
          if (!card) continue;
          const nombre = l.n.toLowerCase();
          let match = !txt || nombre.includes(txt);
          card.style.display = match ? "" : "none";
        }
      }

      // ═══════════════════════════════════════════════════════
      // MODAL HISTORIAL
      // ═══════════════════════════════════════════════════════
      function verHistorial(key, nombre) {
        document.getElementById("modal-tit").textContent = "📋 " + nombre;
        document.getElementById("mbg").classList.add("open");
        const hist = getHist().filter((d) => (d[key] || []).length >= 3);
        const mb = document.getElementById("modal-body");
        if (!hist.length) {
          mb.innerHTML = `<div class="err" style="font-size:12px">Sin historial disponible para esta lotería todavía. Se acumula automáticamente cada día que el servidor esté activo.</div>`;
          return;
        }
        let h = `<div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:11px">${hist.length} días con resultados</div>
  <table class="rtable">
  <thead><tr><th>Fecha</th><th style="text-align:center">1ro</th><th style="text-align:center">2do</th><th style="text-align:center">3ro</th></tr></thead><tbody>`;
        for (const d of hist.slice(0, 50)) {
          const n = d[key];
          h += `<tr>
      <td>${fmtF(d.f)}</td>
      ${[n[0], n[1], n[2]]
        .map(
          (x, i) =>
            `<td style="text-align:center"><span class="mini-esf mini-e${
              i + 1
            }" style="width:28px;height:28px;line-height:28px;font-size:.78rem">${p2(
              x
            )}</span></td>`
        )
        .join("")}
    </tr>`;
        }
        h += "</tbody></table>";
        mb.innerHTML = h;
      }

      // ═══════════════════════════════════════════════════════
      // PREDICCIONES — Sistema de Pesos por Posición (60-8-4)
      // ═══════════════════════════════════════════════════════
      let lotAct = "gana_mas";

      const PILL_EMOJI = {
        gana_mas: "🟢", leidsa: "🔵", nacional: "🟡", loteka: "🔴",
      };

      function renderLotPills() {
        const cont = document.getElementById("lot-sel-container");
        if (!cont) return;
        cont.innerHTML = LOTS18.map(
          (l) => `<button
            class="lpill ${l.k} ${l.k === lotAct ? "act" : ""}"
            data-lot="${l.k}"
            onclick="selLot(this)"
          >${PILL_EMOJI[l.k] || "⚪"} ${l.n}</button>`
        ).join("");
      }

      function selLot(btn) {
        document
          .querySelectorAll(".lpill")
          .forEach((b) => b.classList.remove("act"));
        btn.classList.add("act");
        lotAct = btn.dataset.lot;
      }

      function renderSelectores() {
        const optsQuiniela = LOTS18.map(
          (l) => `<option value="${l.k}">${l.n}</option>`
        ).join("");
        const optsCuarteta = CUARTETAS.map(
          (l) => `<option value="${l.k}">🎲 ${l.n}</option>`
        ).join("");
        const optsEspeciales = ESPECIALES_PRED_LIST.map(
          (l) => `<option value="${l.k}">🎰 ${l.n} [${l.empresa}]</option>`
        ).join("");

        // Backtesting: solo quiniela + cuarteta (el modelo Punto/Pale/Súper
        // Pale/Tripleta no aplica igual a Kino/Loto). Para especiales, el
        // análisis walk-forward está dentro de su propia tarjeta en Predicciones.
        const bloqueBack = `<option value="todas">Todas las loterías</option>
          <optgroup label="Quinielas (3 números)">${optsQuiniela}</optgroup>
          <optgroup label="La Cuarteta (4 números)">${optsCuarteta}</optgroup>`;

        // Consultas: incluye todo, ya que ahí solo se listan resultados pasados.
        const bloqueCons = `<option value="todas">Todas</option>
          <optgroup label="Quinielas (3 números)">${optsQuiniela}</optgroup>
          <optgroup label="La Cuarteta (4 números)">${optsCuarteta}</optgroup>
          <optgroup label="Juegos Especiales">${optsEspeciales}</optgroup>`;

        const selBack = document.getElementById("sel-back");
        const selCons = document.getElementById("lot-cons");
        if (selBack) selBack.innerHTML = bloqueBack;
        if (selCons) selCons.innerHTML = bloqueCons;
      }

      async function generarPred() {
        const btn = document.getElementById("btn-pred");
        btn.disabled = true;
        btn.textContent = "Analizando...";
        document.getElementById("spin-pred").style.display = "flex";
        document.getElementById("pred-body").innerHTML = "";
        const hist = getHist();
        const datos = hist
          .filter((d) => (d[lotAct] || []).length >= 3)
          .map((d) => d[lotAct]);
        if (datos.length < 5) {
          document.getElementById(
            "pred-body"
          ).innerHTML = `<div class="err">Necesito al menos 5 sorteos para esta lotería. Actualmente hay ${datos.length}.</div>`;
          document.getElementById("spin-pred").style.display = "none";
          btn.disabled = false;
          btn.textContent = "Analizar";
          return;
        }
        const a = analizarLot(datos);
        renderPred(a, INFO_LOOKUP[lotAct], datos.length);
        document.getElementById("spin-pred").style.display = "none";
        btn.disabled = false;
        btn.textContent = "Analizar";
      }

      function analizarLot(datos) {
        const n = datos.length;
        const freq = {};
        for (let i = 0; i <= 99; i++) freq[i] = 0;
        for (const d of datos) for (const x of d) freq[x] = (freq[x] || 0) + 1;
        const PESOS = [60, 8, 4];
        const freqPond = {};
        for (let i = 0; i <= 99; i++) freqPond[i] = 0;
        for (const d of datos)
          for (let pos = 0; pos < Math.min(3, d.length); pos++)
            freqPond[d[pos]] = (freqPond[d[pos]] || 0) + PESOS[pos];

        const pos0 = {},
          pos1 = {},
          pos2 = {};
        for (const d of datos) {
          if (d[0] !== undefined) pos0[d[0]] = (pos0[d[0]] || 0) + 1;
          if (d[1] !== undefined) pos1[d[1]] = (pos1[d[1]] || 0) + 1;
          if (d[2] !== undefined) pos2[d[2]] = (pos2[d[2]] || 0) + 1;
        }
        const top0 =
          +Object.entries(pos0).sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
        const top1 =
          +Object.entries(pos1).sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
        const top2 =
          +Object.entries(pos2).sort((a, b) => b[1] - a[1])[0]?.[0] || 0;

        const ordSimp = Object.entries(freq)
          .sort((a, b) => b[1] - a[1])
          .map(([n]) => +n);
        const ordPond = Object.entries(freqPond)
          .sort((a, b) => b[1] - a[1])
          .map(([n]) => +n);

        const ultima = {};
        for (let i = 0; i < datos.length; i++)
          for (const x of datos[i]) if (ultima[x] === undefined) ultima[x] = i;
        const friosCiclo = Object.entries(ultima)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([n]) => +n);
        const nunca = [];
        for (let i = 0; i <= 99; i++)
          if (freq[i] === 0 && nunca.length < 5) nunca.push(i);

        const pares = {};
        for (const d of datos)
          for (let i = 0; i < d.length; i++)
            for (let j = i + 1; j < d.length; j++) {
              const k = [d[i], d[j]].sort((a, b) => a - b).join("-");
              pares[k] = (pares[k] || 0) + 1;
            }
        const topPares = Object.entries(pares).sort((a, b) => b[1] - a[1]);

        const trips = {};
        for (const d of datos) {
          const k = d
            .slice(0, 3)
            .sort((a, b) => a - b)
            .join("-");
          trips[k] = (trips[k] || 0) + 1;
        }
        const topTrips = Object.entries(trips).sort((a, b) => b[1] - a[1]);

        function aciertos(nums) {
          let p = 0,
            pa = 0,
            sp = 0,
            tr = 0;
          for (const d of datos) {
            const h = d.filter((x) => nums.includes(x)).length;
            if (h >= 1) p++;
            if (h >= 2) pa++;
            if (h >= 3) {
              sp++;
              tr++;
            }
          }
          return {
            p: pct(p, n),
            pa: pct(pa, n),
            sp: pct(sp, n),
            tr: pct(tr, n),
          };
        }
        function pct(a, b) {
          return b > 0 ? Math.round((a / b) * 100) : 0;
        }

        const j1num = ordPond[0];
        const a1 = aciertos([j1num, ordPond[1], ordPond[2]]);
        const j2num = top0;
        const a2 = aciertos([top0, ordSimp[0], ordSimp[1]]);
        const j3 = [ordPond[0], ordPond[1]];
        const a3 = aciertos([...j3, ordPond[2]]);
        let j4 = [ordSimp[0], ordSimp[1]];
        if (topPares.length > 0) j4 = topPares[0][0].split("-").map(Number);
        const a4 = aciertos([...j4, ordSimp[2]]);
        const j5 = [
          friosCiclo[0] || nunca[0] || 50,
          friosCiclo[1] || nunca[1] || 60,
        ];
        const a5 = aciertos([...j5, friosCiclo[2] || 70]);
        const j6 = ordPond.slice(0, 3);
        const a6 = aciertos(j6);
        const j7 = [top0, top1, top2];
        const a7 = aciertos(j7);
        let j8 = ordPond.slice(0, 3);
        if (topTrips.length > 0 && topTrips[0][1] > 1)
          j8 = topTrips[0][0].split("-").map(Number);
        const a8 = aciertos(j8);
        const j9 = [ordPond[0], friosCiclo[0] || nunca[0] || 55, top0].map(
          (x) => +x % 100
        );
        const a9 = aciertos(j9);

        return {
          n,
          ordPond,
          ordSimp,
          friosCiclo,
          nunca,
          topPares,
          topTrips,
          freq,
          freqPond,
          jugadas: [
            {
              tipo: "tp",
              label: "Punto Ponderado",
              nums: [j1num],
              conf: a1.p,
              met: `El número con mayor score cuando se pondera 1ra(×60), 2da(×8), 3ra(×4). El mejor número para jugar un solo punto.`,
            },
            {
              tipo: "tp",
              label: "Punto Posicional 1ra",
              nums: [j2num],
              conf: a2.p,
              met: `El número que más veces salió exactamente en 1ra posición (paga 60x). Máxima rentabilidad histórica por peso.`,
            },
            {
              tipo: "tpa",
              label: "Pale Ponderado",
              nums: j3,
              conf: a3.pa,
              met: `Los 2 con mayor score ponderado. Combinación que más valor histórico acumula en todo el historial.`,
            },
            {
              tipo: "tpa",
              label: "Pale Histórico",
              nums: j4,
              conf: a4.pa,
              met: `El par que más veces salió junto en el historial. Co-ocurrencia real: ${
                topPares[0] ? topPares[0][1] + "x juntos" : "-"
              }.`,
            },
            {
              tipo: "tpa",
              label: "Pale Frío (Por Salir)",
              nums: j5,
              conf: a5.pa,
              met: `Los 2 números que más sorteos llevan sin aparecer. Candidatos por equilibrio del historial.`,
            },
            {
              tipo: "tsp",
              label: "Super Pale Ponderado",
              nums: j6,
              conf: a6.pa,
              met: `Top 3 por score ponderado (pesos 60-8-4). Al menos 2 de los 3 salieron en ${a6.pa}% de los sorteos anteriores.`,
            },
            {
              tipo: "tsp",
              label: "Super Pale Posicional",
              nums: j7,
              conf: a7.pa,
              met: `El top de cada posición: 1ro=${p2(top0)}, 2do=${p2(
                top1
              )}, 3ro=${p2(top2)}. Al menos 2 de los 3 coincidieron en ${a7.pa}% de los sorteos.`,
            },
            {
              tipo: "ttr",
              label: "Tripleta Histórica",
              nums: j8,
              conf: a8.sp,
              met:
                topTrips[0] && topTrips[0][1] > 1
                  ? `Única tripleta que se repitió exacta ${topTrips[0][1]} veces en el historial.`
                  : `La combinación ponderada más compacta del historial.`,
            },
            {
              tipo: "ttr",
              label: "Tripleta Mixta",
              nums: j9,
              conf: a9.sp,
              met: `Caliente ponderado (${p2(ordPond[0])}) + Frío ciclo (${p2(
                friosCiclo[0]
              )}) + Top 1ra posición (${p2(top0)}). Máxima diversificación.`,
            },
          ],
        };
      }

      const TIPOS = {
        tp: { lab: "PUNTO", desc: "1 número · Paga 60x si sale en 1ra" },
        tpa: { lab: "PALE", desc: "2 números · Ambos deben salir" },
        tsp: { lab: "SUPER PALE", desc: "3 números · Al menos 2 deben salir" },
        ttr: { lab: "TRIPLETA", desc: "3 números exactos en el mismo sorteo" },
      };

      function renderPred(a, info, dias) {
        const cc = (n) => {
          if (n >= 55) return "var(--green)";
          if (n >= 35) return "var(--gold)";
          return "var(--red)";
        };

        let html = `<div class="lot-box">
    <div class="lot-box-tit">${info.n} — Estadísticas del historial</div>
    <div class="lot-grid">
      <div class="lot-item"><div class="lot-item-n">${dias}</div><div class="lot-item-l">Días analizados</div></div>
      <div class="lot-item"><div class="lot-item-n">${p2(
        a.ordPond[0]
      )}</div><div class="lot-item-l">Top ponderado</div></div>
      <div class="lot-item"><div class="lot-item-n">${
        a.topPares[0] ? a.topPares[0][0] : "--"
      }</div><div class="lot-item-l">Mejor pale</div></div>
      <div class="lot-item"><div class="lot-item-n">${
        a.freq[a.ordPond[0]] || 0
      }x</div><div class="lot-item-l">Máx. apariciones</div></div>
    </div>
    <div class="lot-nota">💡 Sistema de pesos: 1ra posición ×60 · 2da ×8 · 3ra ×4 (igual que el pago real de la quiniela). Los % son históricos reales sobre ${dias} sorteos.</div>
  </div>`;

        for (const [tkey, tinfo] of Object.entries(TIPOS)) {
          const jj = a.jugadas.filter((j) => j.tipo === tkey);
          if (!jj.length) continue;
          html += `<div class="jsec"><div class="jsec-tit">${
            tkey === "tp"
              ? "🎯"
              : tkey === "tpa"
              ? "⚡"
              : tkey === "tsp"
              ? "🔥"
              : "👑"
          } ${tinfo.lab} <span>${tinfo.desc}</span></div>`;
          for (const j of jj) {
            const numH = j.nums
              .map((n) => `<div class="jnum">${p2(n)}</div>`)
              .join("");
            html += `<div class="jcard ${j.tipo}">
        <div class="jleft">
          <div class="jtype">${TIPOS[j.tipo].lab}</div>
          <div class="jconf" style="color:${cc(j.conf)}">${j.conf}%</div>
          <div class="jconf-l">hist. real</div>
        </div>
        <div class="jdiv"></div>
        <div class="jnums">${numH}</div>
        <div class="jinfo">
          <div class="jmet">${j.label}</div>
          <div class="jraz">${j.met}</div>
        </div>
      </div>`;
          }
          html += "</div>";
        }
        document.getElementById("pred-body").innerHTML = html;
      }

      // ═══════════════════════════════════════════════════════
      // PREDICCIÓN LA CUARTETA — 4 números sin orden
      // A diferencia de la quiniela (3 números posicionales 60-8-4), aquí el
      // premio es por combinación SIN importar el orden, así que no aplican
      // los pesos por posición. El % de confianza que se muestra aquí es
      // WALK-FORWARD desde el primer día: en cada sorteo de prueba se genera
      // la jugada usando SOLO el historial anterior a ese sorteo (nunca datos
      // del mismo día que se evalúa), para que el % sea una estimación
      // honesta de rendimiento futuro y no una medida inflada contra los
      // mismos datos que generaron la jugada.
      // ═══════════════════════════════════════════════════════
      let lotActCuarteta = "cuarteta_n";

      function renderCuartetaPills() {
        const cont = document.getElementById("cuarteta-sel-container");
        if (!cont) return;
        cont.innerHTML = CUARTETAS.map(
          (l) => `<button
            class="lpill ${l.k === lotActCuarteta ? "act" : ""}"
            data-lot="${l.k}"
            onclick="selLotCuarteta(this)"
          >🎲 ${l.n}</button>`
        ).join("");
      }

      function selLotCuarteta(btn) {
        document
          .querySelectorAll("#cuarteta-sel-container .lpill")
          .forEach((b) => b.classList.remove("act"));
        btn.classList.add("act");
        lotActCuarteta = btn.dataset.lot;
      }

      async function generarPredCuarteta() {
        const btn = document.getElementById("btn-pred-cuarteta");
        btn.disabled = true;
        btn.textContent = "Analizando...";
        document.getElementById("spin-pred-cuarteta").style.display = "flex";
        document.getElementById("pred-cuarteta-body").innerHTML = "";
        const hist = getHist(); // descendente: más reciente primero
        const datosDesc = hist
          .filter((d) => (d[lotActCuarteta] || []).length >= 4)
          .map((d) => d[lotActCuarteta]);
        if (datosDesc.length < 8) {
          document.getElementById(
            "pred-cuarteta-body"
          ).innerHTML = `<div class="err">Necesito al menos 8 sorteos de La Cuarteta para este horario. Actualmente hay ${datosDesc.length}.</div>`;
          document.getElementById("spin-pred-cuarteta").style.display = "none";
          btn.disabled = false;
          btn.textContent = "Analizar";
          return;
        }
        const datosAsc = [...datosDesc].reverse(); // cronológico: más viejo primero
        const r = analizarCuarteta(datosAsc);
        renderPredCuarteta(r, INFO_LOOKUP[lotActCuarteta], datosDesc.length);
        document.getElementById("spin-pred-cuarteta").style.display = "none";
        btn.disabled = false;
        btn.textContent = "Analizar";
      }

      function topNFrecuentesCuarteta(datosTrain, cantidad) {
        const f = {};
        for (const d of datosTrain) for (const x of d) f[x] = (f[x] || 0) + 1;
        return Object.entries(f)
          .sort((a, b) => b[1] - a[1])
          .slice(0, cantidad)
          .map(([n]) => +n);
      }
      function friosTrainCuarteta(datosTrain, cantidad) {
        const u = {};
        for (let i = 0; i < datosTrain.length; i++)
          for (const x of datosTrain[i]) u[x] = i;
        return Object.entries(u)
          .sort((a, b) => a[1] - b[1])
          .slice(0, cantidad)
          .map(([n]) => +n);
      }

      function analizarCuarteta(datosAsc) {
        const MIN_TRAIN = 6;
        const resTop = { h4: 0, h3: 0, h2: 0, total: 0 };
        const resFrio = { h4: 0, h3: 0, h2: 0, total: 0 };

        for (let i = MIN_TRAIN; i < datosAsc.length; i++) {
          const train = datosAsc.slice(0, i);
          const actual = datosAsc[i];

          const pickTop = topNFrecuentesCuarteta(train, 4);
          const mTop = pickTop.filter((x) => actual.includes(x)).length;
          resTop.total++;
          if (mTop >= 4) resTop.h4++;
          if (mTop >= 3) resTop.h3++;
          if (mTop >= 2) resTop.h2++;

          const pickFrio = friosTrainCuarteta(train, 4);
          const mFrio = pickFrio.filter((x) => actual.includes(x)).length;
          resFrio.total++;
          if (mFrio >= 4) resFrio.h4++;
          if (mFrio >= 3) resFrio.h3++;
          if (mFrio >= 2) resFrio.h2++;
        }

        function pctOf(o) {
          const t = o.total || 1;
          return {
            p4: Math.round((o.h4 / t) * 100),
            p3: Math.round((o.h3 / t) * 100),
            p2: Math.round((o.h2 / t) * 100),
          };
        }

        return {
          top4Hoy: topNFrecuentesCuarteta(datosAsc, 4),
          friosHoy: friosTrainCuarteta(datosAsc, 4),
          statsTop: pctOf(resTop),
          statsFrio: pctOf(resFrio),
          probados: resTop.total,
        };
      }

      function renderPredCuarteta(r, info, dias) {
        const cc = (v) => {
          if (v >= 25) return "var(--green)";
          if (v >= 10) return "var(--gold)";
          return "var(--red)";
        };
        const html = `<div class="lot-box">
    <div class="lot-box-tit">${info.n} — Análisis Walk-Forward (honesto)</div>
    <div class="lot-nota">💡 Estos % se calcularon simulando el sistema hacia atrás en ${r.probados} sorteos de prueba: en cada uno se generó la jugada usando solo los datos ANTERIORES a ese sorteo, nunca los del mismo día evaluado. Así reflejan qué tan bien habría funcionado en la práctica, no solo qué tan bien explican el pasado.</div>
  </div>
  <div class="jsec"><div class="jsec-tit">🔥 Top 4 por frecuencia <span>Jugada recomendada con todo el historial</span></div>
    <div class="jcard tsp">
      <div class="jleft">
        <div class="jtype">CUARTETA</div>
        <div class="jconf" style="color:${cc(r.statsTop.p2)}">${
          r.statsTop.p2
        }%</div>
        <div class="jconf-l">2+ de 4 (walk-fwd)</div>
      </div>
      <div class="jdiv"></div>
      <div class="jnums">${r.top4Hoy
        .map((x) => `<div class="jnum">${p2(x)}</div>`)
        .join("")}</div>
      <div class="jinfo">
        <div class="jmet">Los 4 números más frecuentes del historial</div>
        <div class="jraz">Tasa real fuera de muestra: pegar los 4 (premio mayor US$500k) ${
          r.statsTop.p4
        }% de las veces · pegar 3 (US$5,000) ${
          r.statsTop.p3
        }% · pegar 2 (US$100) ${r.statsTop.p2}%.</div>
      </div>
    </div>
  </div>
  <div class="jsec"><div class="jsec-tit">❄️ Fríos por ciclo <span>Más sorteos sin salir</span></div>
    <div class="jcard tpa">
      <div class="jleft">
        <div class="jtype">CUARTETA</div>
        <div class="jconf" style="color:${cc(r.statsFrio.p2)}">${
          r.statsFrio.p2
        }%</div>
        <div class="jconf-l">2+ de 4 (walk-fwd)</div>
      </div>
      <div class="jdiv"></div>
      <div class="jnums">${r.friosHoy
        .map((x) => `<div class="jnum">${p2(x)}</div>`)
        .join("")}</div>
      <div class="jinfo">
        <div class="jmet">Los 4 con más sorteos de ausencia</div>
        <div class="jraz">Tasa real fuera de muestra: pegar los 4 ${
          r.statsFrio.p4
        }% · pegar 3 ${r.statsFrio.p3}% · pegar 2 ${r.statsFrio.p2}%.</div>
      </div>
    </div>
  </div>`;
        document.getElementById("pred-cuarteta-body").innerHTML = html;
      }

      // ═══════════════════════════════════════════════════════
      // PREDICCIÓN JUEGOS ESPECIALES (Pega 3 Más, Super Kino, Loto, etc.)
      // pega3/pega4: cada posición es un dígito independiente 0-9, se predice
      //   el dígito más frecuente EN ESA POSICIÓN.
      // kino/loto/lotomas: no hay posición, solo frecuencia general (como
      //   La Cuarteta), porque el premio no depende de orden.
      // (ESPECIALES_PRED_LIST y TIPO_PRED_CANT_FE ya están definidos arriba,
      // junto a INFO_LOOKUP, para que ambos puedan compartirlos)
      // ═══════════════════════════════════════════════════════
      let lotActEspecial = "pega3mas";

      function renderEspecialPills() {
        const cont = document.getElementById("especial-sel-container");
        if (!cont) return;
        cont.innerHTML = ESPECIALES_PRED_LIST.map(
          (l) => `<button class="lpill ${l.k === lotActEspecial ? "act" : ""}" data-lot="${l.k}" onclick="selLotEspecial(this)">🎰 ${l.n}</button>`
        ).join("");
      }
      function selLotEspecial(btn) {
        document.querySelectorAll("#especial-sel-container .lpill").forEach((b) => b.classList.remove("act"));
        btn.classList.add("act");
        lotActEspecial = btn.dataset.lot;
      }

      function topNFrecuenciaGen(datosTrain, cantidad) {
        const f = {};
        for (const d of datosTrain) for (const x of d) f[x] = (f[x] || 0) + 1;
        return Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, cantidad).map(([n]) => +n);
      }
      function digitoTopPorPosicion(datosTrain, cantDigitos) {
        const out = [];
        for (let pos = 0; pos < cantDigitos; pos++) {
          const f = {};
          for (const d of datosTrain) {
            const v = d[pos];
            if (v !== undefined) f[v] = (f[v] || 0) + 1;
          }
          const top = Object.entries(f).sort((a, b) => b[1] - a[1])[0];
          out.push(top ? +top[0] : 0);
        }
        return out;
      }

      async function generarPredEspecial() {
        const btn = document.getElementById("btn-pred-especial");
        btn.disabled = true;
        btn.textContent = "Analizando...";
        document.getElementById("spin-pred-especial").style.display = "flex";
        document.getElementById("pred-especial-body").innerHTML = "";

        const info = ESPECIALES_PRED_LIST.find((l) => l.k === lotActEspecial);
        const hist = getHist();
        const datosDesc = hist
          .filter((d) => (d[lotActEspecial] || []).length > 0)
          .map((d) => d[lotActEspecial]);

        if (datosDesc.length < 8) {
          document.getElementById("pred-especial-body").innerHTML =
            `<div class="err">Necesito al menos 8 sorteos de ${info.n} para analizar. Actualmente hay ${datosDesc.length}.</div>`;
          document.getElementById("spin-pred-especial").style.display = "none";
          btn.disabled = false;
          btn.textContent = "Analizar";
          return;
        }

        const datosAsc = [...datosDesc].reverse();
        const esDigitos = info.tipo === "pega3" || info.tipo === "pega4";
        const cantPred = esDigitos ? info.cant : TIPO_PRED_CANT_FE[info.tipo] || info.cant;

        // Walk-forward: para cada sorteo de prueba, genera la jugada SOLO
        // con datos anteriores a ese sorteo y mide si acertó.
        const MIN_TRAIN = 6;
        let h2 = 0, hTotal = 0, total = 0;
        let prediccionFinal;

        for (let i = MIN_TRAIN; i < datosAsc.length; i++) {
          const train = datosAsc.slice(0, i);
          const actual = datosAsc[i];
          let pick;
          if (esDigitos) {
            pick = digitoTopPorPosicion(train, cantPred);
            const aciertos = pick.filter((d, idx) => actual[idx] === d).length;
            total++;
            if (aciertos >= Math.ceil(cantPred / 2)) h2++;
            if (aciertos === cantPred) hTotal++;
          } else {
            pick = topNFrecuenciaGen(train, cantPred);
            const aciertos = actual.filter((x) => pick.includes(x)).length;
            total++;
            if (aciertos >= 2) h2++;
            if (aciertos >= Math.min(3, actual.length)) hTotal++;
          }
        }

        prediccionFinal = esDigitos
          ? digitoTopPorPosicion(datosAsc, cantPred)
          : topNFrecuenciaGen(datosAsc, cantPred);

        const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);
        renderPredEspecial(info, prediccionFinal, pct(h2), pct(hTotal), total, esDigitos);

        document.getElementById("spin-pred-especial").style.display = "none";
        btn.disabled = false;
        btn.textContent = "Analizar";
      }

      function renderPredEspecial(info, pick, pctMedio, pctAlto, probados, esDigitos) {
        const cc = (v) => (v >= 25 ? "var(--green)" : v >= 10 ? "var(--gold)" : "var(--red)");
        const numsHTML = pick
          .map((x) => `<div class="jnum">${esDigitos ? x : p2(x)}</div>`)
          .join("");
        const tipoLabel = esDigitos
          ? `${pick.length} dígitos posicionales`
          : `Top ${pick.length} por frecuencia (sin orden)`;
        const html = `<div class="lot-box">
    <div class="lot-box-tit">${info.n} [${info.empresa}] — Análisis Walk-Forward (honesto)</div>
    <div class="lot-nota">💡 Calculado simulando hacia atrás en ${probados} sorteos: cada jugada se generó usando solo los datos ANTERIORES a ese sorteo. Método: ${tipoLabel}.</div>
  </div>
  <div class="jsec"><div class="jsec-tit">🎯 Jugada recomendada <span>Con todo el historial disponible</span></div>
    <div class="jcard tsp">
      <div class="jleft">
        <div class="jtype">${info.tipo.toUpperCase()}</div>
        <div class="jconf" style="color:${cc(pctMedio)}">${pctMedio}%</div>
        <div class="jconf-l">acierto parcial (walk-fwd)</div>
      </div>
      <div class="jdiv"></div>
      <div class="jnums">${numsHTML}</div>
      <div class="jinfo">
        <div class="jmet">${info.n} — ${info.hora}</div>
        <div class="jraz">Tasa real fuera de muestra: acierto alto (mayoría/todos) ${pctAlto}% de las veces · acierto parcial ${pctMedio}%.</div>
      </div>
    </div>
  </div>`;
        document.getElementById("pred-especial-body").innerHTML = html;
      }

      // ═══════════════════════════════════════════════════════
      // BACKTESTING
      // ═══════════════════════════════════════════════════════
      function cargarBack() {
        const lot = document.getElementById("sel-back").value;
        const hist = getHist();
        const todasClaves = [
          ...LOTS18.map((l) => l.k),
          ...CUARTETAS.map((l) => l.k),
        ];
        const freq = {},
          pares = {},
          trips = {};
        let total = 0;
        for (const d of hist) {
          const lk = lot === "todas" ? todasClaves : [lot];
          for (const l of lk) {
            const nums = d[l] || [];
            const minNum = l.startsWith("cuarteta_") ? 4 : 3;
            if (nums.length < minNum) continue;
            total++;
            for (const n of nums) freq[n] = (freq[n] || 0) + 1;
            for (let i = 0; i < nums.length; i++)
              for (let j = i + 1; j < nums.length; j++) {
                const k = [nums[i], nums[j]].sort((a, b) => a - b).join("-");
                pares[k] = (pares[k] || 0) + 1;
              }
            const tk = nums
              .slice(0, 3)
              .sort((a, b) => a - b)
              .join("-");
            trips[tk] = (trips[tk] || 0) + 1;
          }
        }
        if (!total) {
          document.getElementById("back-ins").innerHTML =
            '<p style="font-size:12px;color:var(--muted)">Sin datos.</p>';
          return;
        }

        const maxF = Math.max(...Object.values(freq), 1);

        // ── WALK-FORWARD honesto ──────────────────────────────────────────
        // Para cada lotería se construye su serie cronológica y, sorteo por
        // sorteo, se calcula el top-5 usando SOLO los días anteriores a ese
        // sorteo. Nunca se usa el resultado del mismo día que se evalúa, así
        // el % no se infla con datos que el sistema "ya conocía".
        const lkWF = lot === "todas" ? todasClaves : [lot];
        let aP = 0,
          aPa = 0,
          aSp = 0,
          aT = 0,
          totalWF = 0;
        const MIN_TRAIN = 5;
        for (const k of lkWF) {
          const minNum = k.startsWith("cuarteta_") ? 4 : 3;
          const serieDesc = hist
            .filter((d) => (d[k] || []).length >= minNum)
            .map((d) => d[k]);
          const serieAsc = [...serieDesc].reverse();
          for (let i = MIN_TRAIN; i < serieAsc.length; i++) {
            const train = serieAsc.slice(0, i);
            const actual = serieAsc[i];
            const f = {};
            for (const dd of train) for (const n of dd) f[n] = (f[n] || 0) + 1;
            const top5 = Object.entries(f)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([n]) => +n);
            const h = actual.filter((n) => top5.includes(n)).length;
            totalWF++;
            if (h >= 1) aP++;
            if (h >= 2) aPa++;
            if (h >= 3) {
              aSp++;
              aT++;
            }
          }
        }
        const pp = (n) => (totalWF > 0 ? Math.round((n / totalWF) * 100) : 0);
        document.getElementById("bh-p").textContent = pp(aP) + "%";
        document.getElementById("bh-pa").textContent = pp(aPa) + "%";
        document.getElementById("bh-sp").textContent = pp(aSp) + "%";
        document.getElementById("bh-tr").textContent = pp(aT) + "%";
        document.getElementById(
          "bh-ps"
        ).textContent = `${aP}/${totalWF} sorteos (walk-fwd)`;
        document.getElementById(
          "bh-pas"
        ).textContent = `${aPa}/${totalWF} sorteos (walk-fwd)`;
        document.getElementById(
          "bh-sps"
        ).textContent = `${aSp}/${totalWF} sorteos (walk-fwd)`;
        document.getElementById(
          "bh-trs"
        ).textContent = `${aT}/${totalWF} sorteos (walk-fwd)`;
        ["bh-pb", "bh-pab", "bh-spb", "bh-trb"].forEach((id, i) => {
          const vals = [pp(aP), pp(aPa), pp(aSp), pp(aT)];
          const cols = ["#00ff66", "#ffb703", "#00f2fe", "#ff0055"];
          document.getElementById(
            id
          ).style.cssText = `background:linear-gradient(90deg,${cols[i]} ${vals[i]}%,rgba(255,255,255,.08) ${vals[i]}%);height:4px;border-radius:2px`;
        });

        const topE = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
        const frioE = Object.entries(freq)
          .sort((a, b) => a[1] - b[1])
          .filter(([, v]) => v > 0)[0];
        const topP = Object.entries(pares).sort((a, b) => b[1] - a[1])[0];
        const topT = Object.entries(trips).sort((a, b) => b[1] - a[1])[0];
        document.getElementById("back-ins").innerHTML = `
    <div class="ins"><span style="font-size:18px">🔥</span><div><strong>Más caliente: ${p2(
      +topE[0]
    )}</strong><p>Salió ${topE[1]}x en ${total} sorteos (${Math.round(
          (topE[1] / total) * 100
        )}%). Con peso ponderado: ${(
          topE[1] * 60
        ).toLocaleString()} pts posicionales.</p></div></div>
    <div class="ins"><span style="font-size:18px">❄️</span><div><strong>Más frío: ${
      frioE ? p2(+frioE[0]) : "--"
    }</strong><p>${
          frioE
            ? `Solo salió ${frioE[1]}x. Candidato fuerte por equilibrio. En 100 sorteos, estadísticamente debería salir ~3x.`
            : "Sin datos."
        }</p></div></div>
    <div class="ins"><span style="font-size:18px">⚡</span><div><strong>Mejor pale: ${
      topP ? topP[0] : "--"
    }</strong><p>${
          topP
            ? `Co-ocurrencia: ${
                topP[1]
              }x juntos en el mismo sorteo (${Math.round(
                (topP[1] / total) * 100
              )}% de los días).`
            : "Sin pares aún."
        }</p></div></div>
    <div class="ins"><span style="font-size:18px">👑</span><div><strong>Tripleta: ${
      topT ? topT[0] : "--"
    }</strong><p>${
          topT && topT[1] > 1
            ? `Salió exacta ${topT[1]} veces — es la única combinación repetida del historial.`
            : "Ninguna tripleta se repitió aún — historial en construcción."
        }</p></div></div>`;

        const cg = document.getElementById("cg");
        cg.innerHTML = "";
        for (let i = 0; i <= 99; i++) {
          const f = freq[i] || 0;
          const r = f / maxF;
          let bg, tc;
          if (r > 0.7) {
            bg = "#14532D";
            tc = "#fff";
          } else if (r > 0.5) {
            bg = "#16A34A";
            tc = "#fff";
          } else if (r > 0.3) {
            bg = "#BBF7D0";
            tc = "#14532D";
          } else if (r > 0) {
            bg = "#D1FAE5";
            tc = "#065F46";
          } else {
            bg = "#1f2937";
            tc = "#6e7681";
          }
          const el = document.createElement("div");
          el.className = "cc";
          el.style.cssText = `background:${bg};color:${tc}`;
          el.textContent = p2(i);
          el.title = `${p2(i)}: ${f}x`;
          cg.appendChild(el);
        }

        const topF = Object.entries(freq)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12);
        document.getElementById("b-freq").innerHTML =
          topF
            .map(
              ([n, f]) => `
    <div class="fi"><div class="fb" style="background:rgba(0,255,102,.15);color:var(--green)">${p2(
      +n
    )}</div>
    <div class="fbg"><div class="fbf" style="width:${Math.round(
      (f / maxF) * 100
    )}%;background:linear-gradient(90deg,#16A34A,#00ff66)"></div></div>
    <span class="fv">${f}x</span>${
                f === maxF ? '<span class="hb">🔥</span>' : ""
              }</div>`
            )
            .join("") ||
          '<p style="font-size:12px;color:var(--muted)">Sin datos</p>';

        const frios8 = Object.entries(freq)
          .sort((a, b) => a[1] - b[1])
          .slice(0, 8);
        document.getElementById("b-frios").innerHTML =
          frios8
            .map(
              ([n, f]) => `
    <div class="fi"><div class="fb" style="background:rgba(0,242,254,.15);color:var(--neon)">${p2(
      +n
    )}</div>
    <div class="fbg"><div class="fbf" style="width:${Math.round(
      (f / maxF) * 100
    )}%;background:linear-gradient(90deg,#0099cc,#00f2fe)"></div></div>
    <span class="fv">${f}x</span><span class="cb">❄️</span></div>`
            )
            .join("") ||
          '<p style="font-size:12px;color:var(--muted)">Sin datos</p>';

        const topPs = Object.entries(pares)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 7);
        document.getElementById("b-pares").innerHTML =
          topPs
            .map(([par, f]) => {
              const [a2, b2] = par.split("-");
              return `<div class="pr"><span class="mini-esf mini-e1" style="width:28px;height:28px;line-height:28px;font-size:.78rem">${p2(
                +a2
              )}</span>
    <span class="mini-esf mini-e2" style="width:28px;height:28px;line-height:28px;font-size:.78rem">${p2(
      +b2
    )}</span>
    <span style="font-size:11px;color:var(--muted);font-weight:700">${f}x juntos</span>
    ${f >= 3 ? '<span class="hb">top</span>' : ""}</div>`;
            })
            .join("") ||
          '<p style="font-size:12px;color:var(--muted)">Sin datos</p>';

        const topTs = Object.entries(trips)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);
        document.getElementById("b-trips").innerHTML =
          topTs
            .map(([trip, f]) => {
              const [a2, b2, c2] = trip.split("-");
              return `<div class="tr2"><span class="mini-esf mini-e1" style="width:26px;height:26px;line-height:26px;font-size:.7rem">${p2(
                +a2
              )}</span>
    <span class="mini-esf mini-e2" style="width:26px;height:26px;line-height:26px;font-size:.7rem">${p2(
      +b2
    )}</span>
    <span class="mini-esf mini-e3" style="width:26px;height:26px;line-height:26px;font-size:.7rem">${p2(
      +c2
    )}</span>
    <span style="font-size:11px;color:var(--muted);font-weight:700">${f}x</span>
    ${f > 1 ? '<span class="hb">exacta</span>' : ""}</div>`;
            })
            .join("") ||
          '<p style="font-size:12px;color:var(--muted)">Sin datos</p>';
      }

      // ═══════════════════════════════════════════════════════
      // CONSULTAR
      // ═══════════════════════════════════════════════════════
      function buscar() {
        const lot = document.getElementById("lot-cons").value;
        const desde = document.getElementById("f-desde").value;
        const hasta = document.getElementById("f-hasta").value;
        const hist = getHist();
        const todasClaves = [
          ...LOTS18.map((l) => l.k),
          ...CUARTETAS.map((l) => l.k),
          ...ESPECIALES_PRED_LIST.map((l) => l.k),
        ];
        const clavesEspeciales = new Set(ESPECIALES_PRED_LIST.map((l) => l.k));
        const res = [];
        for (const d of hist) {
          if (desde && d.f < desde) continue;
          if (hasta && d.f > hasta) continue;
          const lk = lot === "todas" ? todasClaves : [lot];
          for (const l of lk) {
            const nums = d[l] || [];
            const minNum = l.startsWith("cuarteta_") ? 4 : clavesEspeciales.has(l) ? 1 : 3;
            if (nums.length >= minNum) res.push({ f: d.f, lot: l, nums });
          }
        }
        const w = document.getElementById("tabla-cons");
        if (!res.length) {
          w.innerHTML = `<div class="empty"><div class="eico">🔍</div><p>Sin resultados para ese filtro.</p></div>`;
          return;
        }
        let h = `<div style="font-size:12px;color:var(--muted);font-weight:700;margin-bottom:10px">${res.length} resultado(s)</div>
    <div class="cardX"><table class="rtable">
    <thead><tr><th>Fecha</th><th>Lotería</th><th>Números</th></tr></thead><tbody>`;
        for (const r of res.slice(0, 100)) {
          const info = INFO_LOOKUP[r.lot] || { n: r.lot };
          const esCuarteta = r.lot.startsWith("cuarteta_");
          const esEspecial = clavesEspeciales.has(r.lot);
          const colorTag = esEspecial ? "var(--gold)" : esCuarteta ? "var(--gold)" : "var(--neon)";
          const bolas = r.nums
            .map(
              (n, i) =>
                `<span class="mini-esf mini-e${(i % 3) + 1}" style="width:26px;height:26px;line-height:26px;font-size:.72rem;margin:1px">${p2(n)}</span>`
            )
            .join("");
          h += `<tr>
      <td>${fmtF(r.f)}</td>
      <td style="font-weight:800;color:${colorTag}">${esEspecial ? "🎰 " : esCuarteta ? "🎲 " : ""}${info.n}${esEspecial && info.empresa ? ` <span style="font-size:.65rem;color:var(--muted)">[${info.empresa}]</span>` : ""}</td>
      <td><div style="display:flex;flex-wrap:wrap;gap:2px">${bolas}</div></td>
    </tr>`;
        }
        h += "</tbody></table></div>";
        w.innerHTML = h;
      }

      // ═══════════════════════════════════════════════════════
      // MIS JUGADAS — registro personal de apuestas
      // Se guarda 100% en este navegador (localStorage), nunca sale de
      // aquí ni se manda al servidor. El sistema solo COMPARA contra el
      // resultado real cuando ya está disponible; no afecta ni se mezcla
      // con las estadísticas generales del sistema.
      // ═══════════════════════════════════════════════════════
      function clasificarLoteria(clave) {
        if (CUARTETAS.some((c) => c.k === clave)) return "cuarteta";
        const esp = ESPECIALES_PRED_LIST.find((e) => e.k === clave);
        if (esp) return esp.tipo === "pega3" || esp.tipo === "pega4" ? "especial-digitos" : "especial-numeros";
        return "quiniela";
      }

      function poblarSelectorJugadas() {
        const sel = document.getElementById("jg-lot");
        if (!sel) return;
        const optsQ = LOTS18.map((l) => `<option value="${l.k}">${l.n}</option>`).join("");
        const optsC = CUARTETAS.map((l) => `<option value="${l.k}">🎲 ${l.n}</option>`).join("");
        const optsE = ESPECIALES_PRED_LIST.map((l) => `<option value="${l.k}">🎰 ${l.n} [${l.empresa}]</option>`).join("");
        sel.innerHTML = `<option value="">Selecciona...</option>
          <optgroup label="Quinielas (3 números)">${optsQ}</optgroup>
          <optgroup label="La Cuarteta (4 números)">${optsC}</optgroup>
          <optgroup label="Juegos Especiales">${optsE}</optgroup>`;
      }

      function actualizarFormJugada() {
        const clave = document.getElementById("jg-lot").value;
        const tipoWrap = document.getElementById("jg-tipo-wrap");
        const tipoSel = document.getElementById("jg-tipo");
        const numsLabel = document.getElementById("jg-nums-label");
        const numsInput = document.getElementById("jg-nums");
        if (!clave) {
          tipoWrap.style.display = "none";
          numsLabel.textContent = "Números jugados (separados por coma)";
          numsInput.placeholder = "Ej: 12, 34, 56";
          return;
        }
        const grupo = clasificarLoteria(clave);
        if (grupo === "quiniela") {
          tipoWrap.style.display = "block";
          tipoSel.innerHTML = `
            <option value="punto">Punto (1 número)</option>
            <option value="pale">Pale (2 números)</option>
            <option value="superpale">Súper Pale (3 números, sin orden)</option>
            <option value="tripleta">Tripleta (3 números, orden exacto)</option>`;
          numsLabel.textContent = "Números jugados";
          numsInput.placeholder = "Según el tipo: Ej. 12 ó 12,34 ó 12,34,56";
        } else if (grupo === "cuarteta") {
          tipoWrap.style.display = "none";
          numsLabel.textContent = "Los 4 números de La Cuarteta jugados";
          numsInput.placeholder = "Ej: 12, 34, 56, 78";
        } else if (grupo === "especial-digitos") {
          const info = ESPECIALES_PRED_LIST.find((e) => e.k === clave);
          tipoWrap.style.display = "none";
          numsLabel.textContent = `Los ${info.cant} dígitos jugados, en orden`;
          numsInput.placeholder = info.cant === 3 ? "Ej: 3, 7, 1" : "Ej: 3, 7, 1, 9";
        } else {
          const info = ESPECIALES_PRED_LIST.find((e) => e.k === clave);
          tipoWrap.style.display = "none";
          numsLabel.textContent = `Números jugados (hasta ${info.cant})`;
          numsInput.placeholder = "Ej: 5, 12, 23, 41, 56";
        }
      }

      function getJugadas() {
        try {
          const r = localStorage.getItem("rd_jugadas");
          return r ? JSON.parse(r) : [];
        } catch (e) {
          return [];
        }
      }
      function setJugadas(arr) {
        try {
          localStorage.setItem("rd_jugadas", JSON.stringify(arr));
        } catch (e) {}
      }

      function agregarJugada() {
        const clave = document.getElementById("jg-lot").value;
        const fecha = document.getElementById("jg-fecha").value;
        const numsRaw = document.getElementById("jg-nums").value;
        const monto = document.getElementById("jg-monto").value;
        const tipoSel = document.getElementById("jg-tipo");

        if (!clave) return alert("Elige una lotería primero.");
        if (!fecha) return alert("Elige la fecha en que jugaste.");
        const numeros = numsRaw
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));
        if (numeros.length === 0) return alert("Escribe al menos un número.");

        const grupo = clasificarLoteria(clave);
        const tipo = grupo === "quiniela" ? tipoSel.value : grupo;

        // Validación de cantidad según el tipo
        const cantEsperada = { punto: 1, pale: 2, superpale: 3, tripleta: 3 };
        if (grupo === "quiniela" && numeros.length !== cantEsperada[tipo]) {
          return alert(`Para "${tipoSel.options[tipoSel.selectedIndex].text}" debes escribir exactamente ${cantEsperada[tipo]} número(s).`);
        }
        if (grupo === "cuarteta" && numeros.length !== 4) {
          return alert("La Cuarteta necesita exactamente 4 números.");
        }
        if (grupo === "especial-digitos") {
          const info = ESPECIALES_PRED_LIST.find((e) => e.k === clave);
          if (numeros.length !== info.cant) return alert(`${info.n} necesita exactamente ${info.cant} dígitos.`);
        }

        const jugadas = getJugadas();
        jugadas.unshift({
          id: Date.now() + Math.random().toString(36).slice(2, 6),
          clave, fecha, tipo, numeros,
          monto: monto ? parseFloat(monto) : null,
          creado: new Date().toISOString(),
        });
        setJugadas(jugadas);

        document.getElementById("jg-nums").value = "";
        document.getElementById("jg-monto").value = "";
        renderJugadas();
      }

      function eliminarJugada(id) {
        if (!confirm("¿Eliminar esta jugada de tu registro?")) return;
        setJugadas(getJugadas().filter((j) => j.id !== id));
        renderJugadas();
      }

      // Busca el resultado real (números ganadores) de una clave+fecha,
      // combinando el día de hoy (en memoria) con el historial guardado.
      function buscarResultadoReal(clave, fecha) {
        const hist = getHist();
        const dia = hist.find((d) => d.f === fecha);
        if (dia && dia[clave] && dia[clave].length > 0) return dia[clave];
        return null;
      }

      function evaluarJugada(j) {
        const real = buscarResultadoReal(j.clave, j.fecha);
        if (!real) return { estado: "pendiente" };

        const grupo = clasificarLoteria(j.clave);
        let aciertos = 0,
          gano = false,
          detalle = "";

        if (grupo === "quiniela") {
          if (j.tipo === "tripleta") {
            gano = j.numeros.length === 3 && j.numeros.every((n, i) => real[i] === n);
            aciertos = j.numeros.filter((n, i) => real[i] === n).length;
            detalle = gano ? "¡Los 3 en el orden exacto!" : `${aciertos} de 3 en la posición correcta`;
          } else {
            aciertos = j.numeros.filter((n) => real.includes(n)).length;
            const minimo = { punto: 1, pale: 2, superpale: 3 }[j.tipo] || 1;
            gano = aciertos >= minimo;
            detalle = `${aciertos} de ${j.numeros.length} número(s) aparecieron en el resultado`;
          }
        } else if (grupo === "cuarteta") {
          aciertos = j.numeros.filter((n) => real.includes(n)).length;
          gano = aciertos >= 2;
          detalle = aciertos === 4 ? "¡Los 4 exactos!" : aciertos >= 2 ? `Pegaste ${aciertos} de 4` : `Solo ${aciertos} de 4`;
        } else if (grupo === "especial-digitos") {
          aciertos = j.numeros.filter((n, i) => real[i] === n).length;
          gano = aciertos === j.numeros.length;
          detalle = gano ? "¡Todos los dígitos en orden!" : `${aciertos} de ${j.numeros.length} dígitos en su posición exacta`;
        } else {
          aciertos = j.numeros.filter((n) => real.includes(n)).length;
          gano = aciertos >= Math.min(3, j.numeros.length);
          detalle = `${aciertos} de ${j.numeros.length} número(s) coincidieron`;
        }

        return { estado: gano ? "ganada" : "perdida", aciertos, real, detalle };
      }

      const TIPO_LABEL_JG = {
        punto: "Punto", pale: "Pale", superpale: "Súper Pale", tripleta: "Tripleta",
        cuarteta: "Cuarteta", "especial-digitos": "Posicional", "especial-numeros": "Por cantidad",
      };

      function renderJugadas() {
        const jugadas = getJugadas();
        const cont = document.getElementById("jg-lista");
        const statsBox = document.getElementById("jg-stats3");

        let pend = 0, gan = 0, perd = 0, totalApostado = 0;

        if (jugadas.length === 0) {
          cont.innerHTML = `<div class="empty"><div class="eico">🎟️</div><p>Todavía no ha registrado ninguna jugada.</p></div>`;
          statsBox.innerHTML = "";
          return;
        }

        let html = "";
        for (const j of jugadas) {
          const info = INFO_LOOKUP[j.clave] || { n: j.clave };
          const r = evaluarJugada(j);
          if (r.estado === "pendiente") pend++;
          else if (r.estado === "ganada") gan++;
          else perd++;
          if (j.monto) totalApostado += j.monto;

          const numsChips = j.numeros
            .map((n) => {
              const acerto = r.real && r.real.includes(n);
              return `<div class="jg-chip ${acerto ? "acerto" : ""}">${p2(n)}</div>`;
            })
            .join("");

          const badgeTxt = r.estado === "pendiente" ? "⏳ Pendiente" : r.estado === "ganada" ? "✅ Ganaste" : "❌ No acertaste";

          html += `<div class="jg-card ${r.estado}">
            <div class="jg-hdr">
              <div>
                <div class="jg-tit">${info.n}</div>
                <div class="jg-fecha">${fmtF(j.fecha)} · ${TIPO_LABEL_JG[j.tipo] || j.tipo}${j.monto ? ` · RD$${j.monto}` : ""}</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <span class="jg-badge ${r.estado}">${badgeTxt}</span>
                <button class="jg-del" onclick="eliminarJugada('${j.id}')" title="Eliminar">🗑️</button>
              </div>
            </div>
            <div class="jg-nums-row">${numsChips}</div>
            ${
              r.estado !== "pendiente"
                ? `<div class="jg-detail">Resultado real: ${r.real.map((n) => p2(n)).join(" - ")} · ${r.detalle}</div>`
                : `<div class="jg-detail">Aún no hay resultado registrado para esta fecha.</div>`
            }
          </div>`;
        }
        cont.innerHTML = html;

        const totalEval = gan + perd;
        const pct = totalEval > 0 ? Math.round((gan / totalEval) * 100) : 0;
        statsBox.innerHTML = `
          <div class="schip"><div class="schip-n" style="color:var(--gold)">${pend}</div><div class="schip-l">Pendientes</div></div>
          <div class="schip"><div class="schip-n" style="color:var(--green)">${gan}</div><div class="schip-l">Ganadas</div></div>
          <div class="schip"><div class="schip-n" style="color:var(--red)">${perd}</div><div class="schip-l">Perdidas${totalEval > 0 ? ` (${pct}% acierto)` : ""}</div></div>`;
      }


      function p2(n) {
        return n !== undefined && n !== null
          ? String(n).padStart(2, "0")
          : "--";
      }
      function fmtF(f) {
        if (!f) return "---";
        try {
          const [y, m, d] = f.split("-");
          const M = [
            "",
            "Ene",
            "Feb",
            "Mar",
            "Abr",
            "May",
            "Jun",
            "Jul",
            "Ago",
            "Sep",
            "Oct",
            "Nov",
            "Dic",
          ];
          return `${d} ${M[+m]} ${y}`;
        } catch {
          return f;
        }
      }
      function fmtFShort(f) {
        if (!f) return "--/--";
        try {
          const [, m, d] = f.split("-");
          return `${d}/${m}`;
        } catch {
          return f;
        }
      }

      // ═══════════════════════════════════════════════════════
      // INIT
      // ═══════════════════════════════════════════════════════
      window.addEventListener("DOMContentLoaded", () => {
        const hoy = new Date().toISOString().split("T")[0];
        document.getElementById("f-hasta").value = hoy;
        const h30 = new Date();
        h30.setDate(h30.getDate() - 30);
        document.getElementById("f-desde").value = h30
          .toISOString()
          .split("T")[0];
        document.getElementById("jg-fecha").value = hoy;
        renderStats(0);
        renderLotPills();
        renderCuartetaPills();
        renderEspecialPills();
        renderSelectores();
        poblarSelectorJugadas();
        renderJugadas();
        cargarBack();
        fetch(`${API}/`)
          .then((r) => r.json())
          .then((d) => {
            const v = d.version || "desconocida";
            const badge = document.getElementById("status-txt");
            if (v.includes("v5.2") || v.includes("v6") || v.includes("v7")) {
              // versión correcta - no hacemos nada especial, cargarHoy lo sobreescribirá
            } else {
              badge.innerHTML = `⚠️ Servidor en versión <b>${v}</b> — no es la v7.0 más reciente. Sube el server.js nuevo a GitHub.`;
            }
          })
          .catch(() => {});
        setTimeout(cargarHoy, 1500);
        setInterval(cargarHoy, 20 * 60 * 1000);
      });
    </script>
  </body>
</html>
