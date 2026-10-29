/*
 * Marca d'agua invisivel da Fatal Cam: Adobe TrustMark (modelo Q, BCH_5) rodando no navegador.
 *
 * E a mesma logica do TrustMark em Python que o fatalcam_api usava no servidor, portada para JS:
 *   - BCH e DataLayer: traducao direta de trustmark/bchecc.py e trustmark/datalayer.py
 *   - encode/decode: mesmos passos de trustmark/trustmark.py (recorte, resize 256/245, residuo,
 *     feathering), com os modelos exportados para ONNX por ferramentas/exportar_onnx.py
 *
 * Nada sai do aparelho: a foto so passa pela memoria do navegador.
 *
 * As funcoes recebem e devolvem imagens no formato do canvas: { data: RGBA, width, height }.
 * `ort` e o onnxruntime (onnxruntime-web no navegador, onnxruntime-node nos testes).
 */

// ---------------------------------------------------------------- BCH (bchecc.py)
class BCH {
  constructor(t, poly) {
    let tmp = poly, m = 0;
    while (tmp >>> 1) { tmp >>>= 1; m++; }
    const S = this.s = { m, t, poly };
    S.n = 2 ** m - 1;
    S.ecc_bytes = ceilop(m * t, 8);

    const k = 2 ** deg(poly);
    S.exponents = new Array(1 + S.n).fill(0);
    S.logarithms = new Array(1 + S.n).fill(0);
    S.elp_pre = new Array(1 + m).fill(0);
    let x = 1;
    for (let i = 0; i < S.n; i++) {
      S.exponents[i] = x;
      S.logarithms[x] = i;
      x *= 2;
      if (x & k) x ^= poly;
    }
    S.logarithms[0] = 0;
    S.exponents[S.n] = 1;

    // gerador g(x)
    const g = { deg: 0, c: new Array(m * t + 1).fill(0) };
    const roots = new Array(S.n + 1).fill(0);
    const genpoly = new Array(ceilop(m * t + 1, 32)).fill(0);
    for (let i = 0; i < t; i++) {
      let r = 2 * i + 1;
      for (let j = 0; j < m; j++) { roots[r] = 1; r = this.mod(2 * r); }
    }
    g.c[0] = 1;
    for (let i = 0; i < S.n; i++) {
      if (!roots[i]) continue;
      const r = S.exponents[i];
      g.c[g.deg + 1] = 1;
      for (let j = g.deg; j > 0; j--) g.c[j] = this.g_mul(g.c[j], r) ^ g.c[j - 1];
      g.c[0] = this.g_mul(g.c[0], r);
      g.deg++;
    }
    let n = g.deg + 1, i = 0;
    while (n > 0) {
      const nbits = n > 32 ? 32 : n;
      let word = 0;
      for (let j = 0; j < nbits; j++) if (g.c[n - 1 - j]) word += 2 ** (31 - j);
      genpoly[i++] = word;
      n -= nbits;
    }
    S.ecc_bits = g.deg;
    this.build_cyclic(genpoly);

    let sum = 0, aexp = 0;
    outer: for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) sum ^= this.g_pow(i * 2 ** j);
      if (sum) { aexp = S.exponents[i]; break outer; }
    }
    x = 0;
    const precomp = new Array(31).fill(0);
    let remaining = m;
    while (x <= S.n && remaining) {
      let y = this.g_sqrt(x) ^ x;
      for (let i = 0; i < 2; i++) {
        const r = this.g_log(y);
        if (y && r < m && !precomp[r]) { S.elp_pre[r] = x; precomp[r] = 1; remaining--; break; }
        y ^= aexp;
      }
      x++;
    }
  }

  // operacoes de Galois
  mod(v) { return v < this.s.n ? v : v - this.s.n; }
  modn(v) {
    const { n, m } = this.s;
    while (v >= n) { v -= n; v = (v & n) + (v >>> m); }
    return v;
  }
  g_mul(a, b) { return a > 0 && b > 0 ? this.s.exponents[this.mod(this.s.logarithms[a] + this.s.logarithms[b])] : 0; }
  g_div(a, b) { return a ? this.s.exponents[this.mod(this.s.logarithms[a] + this.s.n - this.s.logarithms[b])] : 0; }
  g_sqrt(a) { return a ? this.s.exponents[this.mod(2 * this.s.logarithms[a])] : 0; }
  g_log(x) { return this.s.logarithms[x]; }
  g_pow(i) { return this.s.exponents[this.modn(i)]; }

  get_ecc_bits() { return this.s.ecc_bits; }
  get_ecc_bytes() { return ceilop(this.s.m * this.s.t, 8); }

  build_cyclic(g) {
    const S = this.s;
    const l = ceilop(S.m * S.t, 32);
    const plen = ceilop(S.ecc_bits + 1, 32);
    const ecclen = ceilop(S.ecc_bits, 32);
    S.cyclic_tab = new Array(4 * 256 * l).fill(0);
    for (let i = 0; i < 256; i++) {
      for (let b = 0; b < 4; b++) {
        const offset = (b * 256 + i) * l;
        let data = (i * 2 ** (8 * b)) >>> 0;
        while (data) {
          const d = deg(data);
          data = (data ^ (g[0] >>> (31 - d))) >>> 0;
          for (let j = 0; j < ecclen; j++) {
            const hi = d < 31 ? (g[j] << (d + 1)) >>> 0 : 0;
            const lo = j + 1 < plen ? g[j + 1] >>> (31 - d) : 0;
            S.cyclic_tab[j + offset] = (S.cyclic_tab[j + offset] ^ (hi | lo)) >>> 0;
          }
        }
      }
    }
  }

  encode(data) {
    const S = this.s, tab = S.cyclic_tab;
    const l = ceilop(S.m * S.t, 32) - 1;
    const r = new Array(ceilop(31 * 64, 32)).fill(0);
    const tab0 = 0, tab1 = 256 * (l + 1), tab2 = 2 * tab1, tab3 = 3 * tab1;
    let mlen = Math.floor(data.length / 4), offset = 0;
    while (mlen > 0) {
      const w = (load4bytes(data, offset) ^ r[0]) >>> 0;
      const p0 = tab0 + (l + 1) * ((w >>> 0) & 0xff);
      const p1 = tab1 + (l + 1) * ((w >>> 8) & 0xff);
      const p2 = tab2 + (l + 1) * ((w >>> 16) & 0xff);
      const p3 = tab3 + (l + 1) * ((w >>> 24) & 0xff);
      for (let i = 0; i < l; i++) r[i] = (r[i + 1] ^ tab[p0 + i] ^ tab[p1 + i] ^ tab[p2 + i] ^ tab[p3 + i]) >>> 0;
      r[l] = (tab[p0 + l] ^ tab[p1 + l] ^ tab[p2 + l] ^ tab[p3 + l]) >>> 0;
      mlen--;
      offset += 4;
    }
    const ecc = r;
    for (let posn = offset; posn < data.length; posn++) {
      let pidx = (l + 1) * (((ecc[0] >>> 24) ^ data[posn]) & 0xff);
      for (let i = 0; i < l; i++) ecc[i] = (((ecc[i] << 8) | (ecc[i + 1] >>> 24)) ^ tab[pidx++]) >>> 0;
      ecc[l] = ((ecc[l] << 8) ^ tab[pidx]) >>> 0;
    }
    S.ecc_buf = ecc;
    const out = [];
    for (const e of r) out.push((e >>> 24) & 0xff, (e >>> 16) & 0xff, (e >>> 8) & 0xff, e & 0xff);
    return out.slice(0, S.ecc_bytes);
  }

  // corrige `data` no lugar; devolve o numero de bits corrigidos ou -1
  decode(data, recvecc) {
    const S = this.s;
    this.encode(data);
    S.errloc = [];
    const eccbuf = [];
    let mlen = Math.floor(recvecc.length / 4), offset = 0;
    while (mlen > 0) { eccbuf.push(load4bytes(recvecc, offset)); offset += 4; mlen--; }
    recvecc = recvecc.slice(offset);
    if (recvecc.length > 0) {
      while (recvecc.length < 4) recvecc.push(0);
      eccbuf.push(load4bytes(recvecc, 0));
    }
    const eccwords = ceilop(S.m * S.t, 32);
    let sum = 0;
    for (let i = 0; i < eccwords; i++) {
      S.ecc_buf[i] = (S.ecc_buf[i] ^ eccbuf[i]) >>> 0;
      sum |= S.ecc_buf[i];
    }
    if (sum === 0) return 0;

    let s = S.ecc_bits;
    const t = S.t, n = S.n;
    const syn = new Array(2 * t).fill(0);
    const m = s & 31;
    const synbuf = S.ecc_buf;
    if (m) synbuf[Math.floor(s / 32)] = (synbuf[Math.floor(s / 32)] & ~(2 ** (32 - m) - 1)) >>> 0;
    let synptr = 0;
    while (s > 0 || synptr === 0) {
      let poly = synbuf[synptr++];
      s -= 32;
      while (poly) {
        const i = deg(poly);
        for (let j = 0; j < 2 * t; j += 2) syn[j] ^= this.g_pow((j + 1) * (i + s));
        poly = (poly ^ 2 ** i) >>> 0;
      }
    }
    for (let i = 0; i < t; i++) syn[2 * i + 1] = this.g_sqrt(syn[i]);

    let pp = -1, pd = 1;
    let pelp = { deg: 0, c: new Array(2 * t).fill(0) };
    pelp.c[0] = 1;
    const elp = { deg: 0, c: new Array(2 * t).fill(0) };
    elp.c[0] = 1;
    let d = syn[0];
    for (let i = 0; i < t; i++) {
      if (elp.deg > t) break;
      if (d) {
        const k = 2 * i - pp;
        const elp_copy = { deg: elp.deg, c: elp.c.slice() };
        let tmp = this.g_log(d) + n - this.g_log(pd);
        for (let j = 0; j < pelp.deg + 1; j++) {
          if (pelp.c[j]) elp.c[j + k] ^= this.g_pow(tmp + this.g_log(pelp.c[j]));
        }
        tmp = pelp.deg + k;
        if (tmp > elp.deg) { elp.deg = tmp; pelp = elp_copy; pd = d; pp = 2 * i; }
      }
      if (i < t - 1) {
        d = syn[2 * i + 2];
        for (let j = 1; j < elp.deg + 1; j++) d ^= this.g_mul(elp.c[j], syn[2 * i + 2 - j]);
      }
    }

    const nroots = this.getroots(data.length, elp);
    const nbits = data.length * 8 + S.ecc_bits;
    for (let i = 0; i < nroots; i++) {
      if (S.errloc[i] >= nbits) return -1;
      S.errloc[i] = nbits - 1 - S.errloc[i];
      S.errloc[i] = (S.errloc[i] & ~7) | (7 - (S.errloc[i] & 7));
    }
    for (const bitflip of S.errloc) {
      const byte = Math.floor(bitflip / 8), bit = 2 ** (bitflip & 7);
      if (bitflip < (data.length + recvecc.length) * 8) {
        if (byte < data.length) data[byte] ^= bit;
        else recvecc[byte - data.length] ^= bit;
      }
    }
    return nroots;
  }

  getroots(k, poly) {
    const S = this.s;
    const roots = [];
    if (poly.deg > 2) {
      k = k * 8 + S.ecc_bits;
      const rep = new Array(S.t * 2).fill(0);
      const d = poly.deg;
      const l = S.n - this.g_log(poly.c[poly.deg]);
      for (let i = 0; i < d; i++) rep[i] = poly.c[i] ? this.mod(this.g_log(poly.c[i]) + l) : -1;
      rep[poly.deg] = 0;
      const syn0 = this.g_div(poly.c[0], poly.c[poly.deg]);
      for (let i = S.n - k + 1; i < S.n + 1; i++) {
        let syn = syn0;
        for (let j = 1; j < poly.deg + 1; j++) {
          const m = rep[j];
          if (m >= 0) syn ^= this.g_pow(m + j * i);
        }
        if (syn === 0) {
          roots.push(S.n - i);
          if (roots.length === poly.deg) break;
        }
      }
      if (roots.length < poly.deg) { S.errloc = []; return -1; }
    }
    if (poly.deg === 1 && poly.c[0]) {
      roots.push(this.mod(S.n - S.logarithms[poly.c[0]] + S.logarithms[poly.c[1]]));
    }
    if (poly.deg === 2 && poly.c[0] && poly.c[1]) {
      const l0 = S.logarithms[poly.c[0]], l1 = S.logarithms[poly.c[1]], l2 = S.logarithms[poly.c[2]];
      const u = this.g_pow(l0 + l2 + 2 * (S.n - l1));
      let r = 0, v = u;
      while (v) { const i = deg(v); r ^= S.elp_pre[i]; v ^= 2 ** i; }
      if ((this.g_sqrt(r) ^ r) === u) {
        roots.push(this.modn(2 * S.n - l1 - S.logarithms[r] + l2));
        roots.push(this.modn(2 * S.n - l1 - S.logarithms[r ^ 1] + l2));
      }
    }
    S.errloc = roots;
    return roots.length;
  }
}

function ceilop(a, b) { return Math.floor((a + b - 1) / b); }
function deg(x) { let c = 0; while (x >>> 1) { x >>>= 1; c++; } return c; }
function load4bytes(d, o) { return ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0; }

// ---------------------------------------------------------------- DataLayer (datalayer.py)
const BCH_POLYNOMIAL = 137;
const PAYLOAD_LEN = 100;   // bits que o modelo Q carrega
const VERSION_BITS = 4;
const BCH_5 = 1;           // 61 bits de dados = 8 caracteres ASCII de 7 bits, corrige ate 5 bits

const bits = bytes => bytes.map(x => x.toString(2).padStart(8, "0")).join("");
const bytesDe = str => { const out = []; for (let i = 0; i < str.length; i += 8) out.push(parseInt(str.slice(i, i + 8).padEnd(8, "0"), 2)); return out; };
const pad8 = str => str + "0".repeat((8 - str.length % 8) % 8);

function encodeTextAscii(text) {
  return bytesDe(pad8([...text].map(c => (c.charCodeAt(0) & 127).toString(2).padStart(7, "0")).join("")));
}

function decodeTextAscii(bytes) {
  const s = bits(bytes);
  let out = "";
  for (let i = 0; i < s.length; i += 7) out += String.fromCharCode(parseInt(s.slice(i, i + 7), 2));
  return out;
}

const bchEncoder = new BCH(5, BCH_POLYNOMIAL);
const bchDecoders = { 1: bchEncoder, 2: new BCH(4, BCH_POLYNOMIAL), 3: new BCH(3, BCH_POLYNOMIAL), 0: new BCH(8, BCH_POLYNOMIAL) };

/** texto -> 100 bits (Float32Array) prontos para o encoder */
export function textoParaBits(texto) {
  const eccBits = bchEncoder.get_ecc_bits();
  const dataBits = PAYLOAD_LEN - eccBits - VERSION_BITS;
  let packetD = bits(encodeTextAscii(texto)).slice(0, dataBits);
  packetD = packetD.padEnd(dataBits, "0");
  const ecc = bchEncoder.encode(bytesDe(pad8(packetD)));
  const packetE = bits(ecc).slice(0, eccBits);
  const packet = packetD + packetE + BCH_5.toString(2).padStart(4, "0");
  if (packet.length !== PAYLOAD_LEN) throw new Error("pacote incompleto");
  return Float32Array.from(packet, Number);
}

/** 100 bits (0/1) -> { texto, achou }. achou = BCH confirmou (ou corrigiu) a mensagem */
export function bitsParaTexto(bitArr) {
  const packet = Array.from(bitArr, b => (b ? "1" : "0")).join("");
  const versao = parseInt(packet.slice(-(VERSION_BITS - 2)), 2);
  const corte = { 1: 61, 2: 68, 3: 75, 0: 40 }[versao];
  const decoder = bchDecoders[versao];
  const data = bytesDe(pad8(packet.slice(0, corte)));
  const ecc = bytesDe(pad8(packet.slice(corte, 96)));
  const limpa = s => s.replace(/\0+$/, "").trim();
  if (ecc.length !== decoder.get_ecc_bytes() || decoder.decode(data, ecc) === -1) {
    return { texto: limpa(decodeTextAscii(bytesDe(pad8(packet.slice(0, corte))))), achou: false };
  }
  return { texto: limpa(decodeTextAscii(data)), achou: true };
}

// ---------------------------------------------------------------- imagem (trustmark.py)
const RES_ENC = 256;
const RES_DEC = 245;
const ASPECT_RATIO_LIM = 2.0;   // mais que 2:1 -> o TrustMark usa so o quadrado do centro
const FEATHERING_RESIDUAL = 0.01;

/** area da foto onde a marca mora (get_the_image_for_processing com concentrate_wm_region = 1) */
function regiao(w, h) {
  if (Math.max(w, h) / Math.min(w, h) > ASPECT_RATIO_LIM) {
    const lado = Math.min(w, h);
    return { x: Math.floor((w - lado) / 2), y: Math.floor((h - lado) / 2), w: lado, h: lado };
  }
  return { x: 0, y: 0, w, h };
}

/** Resize BILINEAR do Pillow (com antialias ao reduzir), recortando a regiao antes.
 *  Devolve o tensor (1,3,lado,lado) em [-1,1], como transforms.ToTensor()*2-1. */
function paraTensor(img, reg, lado) {
  const pesos = (entrada, saida, inicio) => {
    const escala = entrada / saida, fs = Math.max(escala, 1);
    return Array.from({ length: saida }, (_, i) => {
      const centro = (i + 0.5) * escala;
      const min = Math.max(Math.floor(centro - fs + 0.5), 0);
      const max = Math.min(Math.floor(centro + fs + 0.5), entrada);
      const w = [];
      for (let x = min; x < max; x++) w.push(Math.max(0, 1 - Math.abs((x - centro + 0.5) / fs)));
      const soma = w.reduce((a, b) => a + b, 0);
      return { min: min + inicio, w: w.map(v => v / soma) };
    });
  };
  const px = pesos(reg.w, lado, reg.x), py = pesos(reg.h, lado, reg.y);
  const W = img.width, src = img.data;
  // passo horizontal: linhas da regiao x lado, arredondado para 8 bits como o Pillow
  const meio = new Uint8ClampedArray(reg.h * lado * 3);
  for (let y = 0; y < reg.h; y++) {
    const linha = (reg.y + y) * W;
    for (let x = 0; x < lado; x++) {
      const { min, w } = px[x];
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < w.length; k++) {
        const o = (linha + min + k) * 4;
        r += src[o] * w[k]; g += src[o + 1] * w[k]; b += src[o + 2] * w[k];
      }
      const o = (y * lado + x) * 3;
      meio[o] = Math.round(r); meio[o + 1] = Math.round(g); meio[o + 2] = Math.round(b);
    }
  }
  const out = new Float32Array(3 * lado * lado), plano = lado * lado;
  for (let y = 0; y < lado; y++) {
    const { min, w } = py[y];
    for (let x = 0; x < lado; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < w.length; k++) {
        const o = ((min - reg.y + k) * lado + x) * 3;
        r += meio[o] * w[k]; g += meio[o + 1] * w[k]; b += meio[o + 2] * w[k];
      }
      const i = y * lado + x;
      out[i] = clamp8(r) / 127.5 - 1;
      out[plano + i] = clamp8(g) / 127.5 - 1;
      out[2 * plano + i] = clamp8(b) / 127.5 - 1;
    }
  }
  return out;
}
const clamp8 = v => Math.min(255, Math.max(0, Math.round(v)));

/** pesos do interpolate(mode='bilinear', align_corners=False) do torch para 1 eixo */
function eixoBilinear(entrada, saida) {
  const i0 = new Int32Array(saida), i1 = new Int32Array(saida), f = new Float32Array(saida);
  const escala = entrada / saida;
  for (let i = 0; i < saida; i++) {
    const s = Math.max((i + 0.5) * escala - 0.5, 0);
    i0[i] = Math.min(Math.floor(s), entrada - 1);
    i1[i] = Math.min(i0[i] + 1, entrada - 1);
    f[i] = s - i0[i];
  }
  return { i0, i1, f };
}

// ---------------------------------------------------------------- API
export class Marca {
  constructor(ort, sessaoEncoder, sessaoDecoder) {
    this.ort = ort;
    this.enc = sessaoEncoder;
    this.dec = sessaoDecoder;
  }

  /** Grava `texto` (ate 8 caracteres) nos pixels. Altera img.data no lugar e devolve img. */
  async gravar(img, texto) {
    const reg = regiao(img.width, img.height);
    const capa = paraTensor(img, reg, RES_ENC);
    const T = this.ort.Tensor;
    const saida = await this.enc.run({
      capa: new T("float32", capa, [1, 3, RES_ENC, RES_ENC]),
      segredo: new T("float32", textoParaBits(texto), [1, 100]),
    });
    const residuo = saida.residuo.data;  // (1,3,256,256), ja sem desvio de cor

    // residuo redimensionado para a regiao + soma na foto + feathering na borda (put_the_image_after_processing)
    const ex = eixoBilinear(RES_ENC, reg.w), ey = eixoBilinear(RES_ENC, reg.h);
    const feather = Math.min(Math.max(1, Math.floor(Math.min(reg.w, reg.h) * FEATHERING_RESIDUAL)), 50);
    const alfa = (i, tam) => (i < feather ? (i + 1) / feather : tam - 1 - i < feather ? (tam - i) / feather : 1);
    const plano = RES_ENC * RES_ENC, px = img.data, W = img.width;
    for (let y = 0; y < reg.h; y++) {
      const a0 = ey.i0[y] * RES_ENC, a1 = ey.i1[y] * RES_ENC, fy = ey.f[y];
      const aLinha = alfa(y, reg.h);
      for (let x = 0; x < reg.w; x++) {
        const b0 = ex.i0[x], b1 = ex.i1[x], fx = ex.f[x];
        // nas colunas da borda o passo das colunas e o ultimo a escrever no Python, entao ele vence
        const aCol = alfa(x, reg.w), a = aCol < 1 ? aCol : aLinha;
        const o = ((reg.y + y) * W + reg.x + x) * 4;
        for (let c = 0; c < 3; c++) {
          const p = c * plano;
          const r = (1 - fy) * ((1 - fx) * residuo[p + a0 + b0] + fx * residuo[p + a0 + b1])
                  + fy * ((1 - fx) * residuo[p + a1 + b0] + fx * residuo[p + a1 + b1]);
          const capaPx = px[o + c];
          const marcado = Math.min(1, Math.max(-1, r + capaPx / 127.5 - 1)) * 127.5 + 127.5;
          px[o + c] = Math.floor(a * marcado + (1 - a) * capaPx);  // astype(uint8) trunca
        }
      }
    }
    return img;
  }

  /** Le o texto gravado. Devolve o texto, ou null se nao achou marca valida. */
  async ler(img) {
    const reg = regiao(img.width, img.height);
    const T = this.ort.Tensor;
    const saida = await this.dec.run({ imagem: new T("float32", paraTensor(img, reg, RES_DEC), [1, 3, RES_DEC, RES_DEC]) });
    const { texto, achou } = bitsParaTexto(Array.from(saida.bits.data, v => v > 0));
    return achou ? texto : null;
  }
}
