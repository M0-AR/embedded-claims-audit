(() => {
  const D = window.ECA;
  if (!D) return;
  const R = D.results;
  const M = D.meta;
  const CLAIMS = D.claims;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = (value, digits = 1) => Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const compact = (value, digits = 1) => Number(value).toLocaleString('en-US', { maximumFractionDigits: digits });
  const pct = (value, digits = 2) => `${fmt(value, digits)}%`;
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const storage = {
    get(key, fallback) { try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  };
  const VERDICT_COLORS = { supported: '--green', qualified: '--amber', refuted: '--red' };
  const ACCENT = ['--amber', '--teal', '--violet', '--red', '--green'];

  let charts = [];
  let currentRoute = 'overview';
  let lastFocus = null;

  function color(name) {
    return name.startsWith('--') ? css(name) : name;
  }

  function verdictBadge(verdict) {
    return `<span class="verdict ${verdict}">${esc(verdict)}</span>`;
  }

  function setupCanvas(canvas, height) {
    const parent = canvas.parentElement;
    const rect = parent.getBoundingClientRect();
    if (rect.width < 20) return null;
    const width = Math.max(180, rect.width - 2);
    const h = Math.max(130, height || rect.height || 200);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = '100%';
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, h);
    return { ctx, width, height: h };
  }

  function drawDonut(canvas, segments) {
    const setup = setupCanvas(canvas, canvas.parentElement.clientHeight || 190);
    if (!setup) return;
    const { ctx, width, height } = setup;
    const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) / 2 - 18;
    const lineWidth = Math.max(12, radius * 0.2);
    let angle = -Math.PI / 2;
    segments.forEach((segment) => {
      const sweep = (segment.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, angle + 0.035, angle + sweep - 0.035);
      ctx.strokeStyle = color(segment.color);
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'butt';
      ctx.stroke();
      angle += sweep;
    });
    ctx.beginPath();
    ctx.arc(cx, cy, radius - lineWidth, 0, Math.PI * 2);
    ctx.strokeStyle = css('--line');
    ctx.lineWidth = 1;
    ctx.stroke();
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', segments.map((segment) => `${segment.value} ${segment.label}`).join(', '));
  }

  function drawChart(canvas, spec) {
    if (!canvas || !spec) return;
    const isDonut = spec.type === 'donut';
    if (isDonut) { drawDonut(canvas, spec.segments); return; }
    const setup = setupCanvas(canvas, spec.height || 200);
    if (!setup) return;
    const { ctx, width, height } = setup;
    const pad = { left: 50, right: 16, top: 30, bottom: 38 };
    const plotW = Math.max(20, width - pad.left - pad.right);
    const plotH = Math.max(20, height - pad.top - pad.bottom);
    const labels = spec.labels || [];
    const series = (spec.series || []).map((entry, index) => ({
      ...entry,
      color: color(entry.color || ACCENT[index % ACCENT.length]),
      values: entry.values.map((value) => Number(value))
    }));
    const allValues = series.flatMap((entry) => entry.values).filter(Number.isFinite);
    if (!allValues.length) return;
    let rawMin = Math.min(...allValues);
    let rawMax = Math.max(...allValues);
    if (rawMin === rawMax) { rawMin = 0; rawMax = Math.max(1, rawMax * 1.2); }
    const yMin = spec.yMin !== undefined ? spec.yMin : Math.min(0, rawMin) === 0 && rawMin >= 0 ? 0 : rawMin - (rawMax - rawMin) * 0.12;
    const yMax = spec.yMax !== undefined ? spec.yMax : rawMax + (rawMax - rawMin) * 0.16;
    const ySpan = yMax - yMin || 1;
    const xCount = Math.max(1, spec.type === 'bar' ? (labels.length || series[0].values.length) : series[0].values.length);
    const xLog = Boolean(spec.xLog && spec.x && spec.x.length);
    const xVals = spec.x ? spec.x.map(Number) : Array.from({ length: xCount }, (_, index) => index);
    const xMin = xLog ? Math.log10(Math.max(1e-9, Math.min(...xVals))) : Math.min(...xVals);
    const xMax = xLog ? Math.log10(Math.max(1e-9, Math.max(...xVals))) : Math.max(...xVals);
    const xSpan = xMax - xMin || 1;

    function xPos(value) {
      const raw = Number(value);
      const transformed = xLog ? Math.log10(Math.max(1e-9, raw)) : raw;
      return pad.left + ((transformed - xMin) / xSpan) * plotW;
    }
    function yPos(value) {
      return pad.top + plotH - ((Number(value) - yMin) / ySpan) * plotH;
    }
    function formatY(value) {
      if (spec.formatY) return spec.formatY(value);
      const abs = Math.abs(value);
      if (abs >= 1000) return compact(value, 0);
      if (abs >= 10) return value.toFixed(0);
      if (abs >= 1) return value.toFixed(1);
      return value.toFixed(2);
    }

    const gridColor = css('--line');
    const textColor = css('--dim');
    ctx.font = '10px ' + (css('--mono') || 'monospace');
    ctx.fillStyle = textColor;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = pad.top + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      const value = yMax - (ySpan * i) / 4;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatY(value), pad.left - 8, y);
    }

    if (spec.yMark !== undefined) {
      const y = yPos(spec.yMark);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = css('--red');
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = css('--red');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(spec.yMarkLabel || String(spec.yMark), pad.left + 4, y - 3);
    }

    if (spec.marks) {
      spec.marks.forEach((mark) => {
        const x = xPos(mark.x);
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = color(mark.color || '--line-strong');
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, pad.top + plotH);
        ctx.stroke();
        ctx.restore();
        if (mark.label) {
          ctx.fillStyle = color(mark.color || '--dim');
          ctx.textAlign = x > width - 80 ? 'right' : 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(mark.label, x + (x > width - 80 ? -4 : 4), pad.top + 2);
        }
      });
    }

    if (spec.type === 'bar') {
      const groupW = plotW / Math.max(1, labels.length || series[0].values.length);
      const barGap = groupW * 0.16;
      const barW = Math.max(3, (groupW - barGap * 2) / series.length);
      series.forEach((entry, sIndex) => {
        entry.values.forEach((value, index) => {
          const x = pad.left + index * groupW + barGap + sIndex * barW;
          const y = yPos(Math.max(yMin, value));
          const h = Math.max(1, yPos(yMin) - y);
          ctx.fillStyle = entry.color;
          ctx.globalAlpha = 0.92;
          ctx.fillRect(x, y, Math.max(2, barW - 2), h);
          ctx.globalAlpha = 1;
        });
      });
      const step = Math.max(1, Math.ceil((labels.length || series[0].values.length) / 6));
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      (labels.length ? labels : series[0].values.map((_, index) => index + 1)).forEach((label, index) => {
        if (index % step !== 0) return;
        const x = pad.left + index * groupW + groupW / 2;
        const text = String(label);
        ctx.fillText(text.length > 13 ? `${text.slice(0, 12)}…` : text, x, pad.top + plotH + 8);
      });
    } else {
      const points = series[0].values.length;
      series.forEach((entry) => {
        ctx.beginPath();
        entry.values.forEach((value, index) => {
          if (!Number.isFinite(value)) return;
          const x = spec.x ? xPos(spec.x[index]) : pad.left + (plotW * index) / Math.max(1, points - 1);
          const y = yPos(value);
          if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = entry.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (spec.fill && series.length === 1) {
          ctx.lineTo(pad.left + plotW, pad.top + plotH);
          ctx.lineTo(pad.left, pad.top + plotH);
          ctx.closePath();
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = entry.color;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        if (points <= 24) {
          entry.values.forEach((value, index) => {
            const x = spec.x ? xPos(spec.x[index]) : pad.left + (plotW * index) / Math.max(1, points - 1);
            ctx.beginPath();
            ctx.arc(x, yPos(value), 2, 0, Math.PI * 2);
            ctx.fillStyle = entry.color;
            ctx.fill();
          });
        }
      });
      const tickCount = Math.min(5, series[0].values.length);
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let i = 0; i < tickCount; i += 1) {
        const index = Math.round((series[0].values.length - 1) * (i / Math.max(1, tickCount - 1)));
        const x = spec.x ? xPos(spec.x[index]) : pad.left + (plotW * index) / Math.max(1, series[0].values.length - 1);
        let label = labels[index] !== undefined ? labels[index] : (spec.x ? spec.x[index] : index + 1);
        if (spec.xLog && spec.x) label = compact(spec.x[index], 0);
        ctx.fillText(String(label).slice(0, 10), x, pad.top + plotH + 8);
      }
    }

    if (spec.xLabel) {
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(spec.xLabel, pad.left + plotW / 2, height - 2);
    }
    if (spec.yLabel) {
      ctx.fillStyle = textColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(spec.yLabel, pad.left, 4);
    }
    if (series.length > 1) {
      let lx = width - pad.right;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      series.slice().reverse().forEach((entry) => {
        const text = entry.name || '';
        if (!text) return;
        ctx.fillStyle = entry.color;
        ctx.fillRect(lx - 8, 7, 8, 3);
        ctx.fillStyle = textColor;
        ctx.fillText(text, lx - 12, 3);
        lx -= ctx.measureText(text).width + 30;
      });
    }
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', spec.summary || `${spec.type || 'line'} chart`);
  }

  function registerChart(canvas, spec) {
    if (!canvas) return;
    canvas._chartSpec = spec;
    charts.push(canvas);
    drawChart(canvas, spec);
  }

  function redrawCharts() {
    charts = charts.filter((canvas) => canvas.isConnected);
    charts.forEach((canvas) => drawChart(canvas, canvas._chartSpec));
  }

  function experimentSeries(experiment) {
    return CLAIMS.filter((claim) => claim.experiment === experiment);
  }

  const SOURCE = {
    E1: 'e01_sixstep.py', E2: 'e02_svpwm.py', E3: 'e03_deadtime.py', E4: 'e04_mt_speed.py', E5: 'e05_kt_ke.py',
    E6: 'e06_i2c.py', E7: 'e07_rs485.py', E8: 'e08_ipc.py', E9: 'e09_hbridge.py', E10: 'e10_paderborn.py'
  };

  const EXP = [
    {
      id: 'E1', key: 'e01_sixstep', title: 'Six-step torque ripple: peak or mean?', metric: '13.397', unit: '% of peak',
      note: 'The exact closed-form ripple of a 120° six-step drive with sinusoidal back-EMF, and how the same waveform becomes 14.030% of mean.',
      values: [
        ['Peak-normalized ripple', '13.397%'], ['Mean-normalized ripple', '14.030%'], ['Ripple ratio, mean/peak', '1.0472'],
        ['Alignment error at +15°', '14.27% of peak'], ['Alignment error at +30°', '50.00% of peak']
      ],
      chart() {
        const sweep = R.e01_sixstep.misalignment.sweep;
        return {
          type: 'line', x: sweep.map((p) => p.delta_deg), labels: sweep.map((p) => `${Number(p.delta_deg.toFixed(2))}°`),
          series: [{ name: 'ripple', values: sweep.map((p) => p.pct_of_peak), color: '--amber' }],
          xLabel: 'Commutation alignment error (deg)', yLabel: 'Torque ripple (% of peak)',
          marks: [{ x: 0, label: 'aligned', color: '--green' }], fill: true, height: 220,
          summary: 'Torque ripple rises from 13.4 percent at perfect alignment to 50 percent at 30 degrees.'
        };
      }
    },
    {
      id: 'E2', key: 'e02_svpwm', title: 'SVPWM headroom is real, not a free lunch', metric: '15.470', unit: '% gain',
      note: 'The linear modulation limit of space-vector PWM is 1/√3, not 1/2. The gain is exactly 2/√3 minus one, not a rule of thumb.',
      values: [
        ['SPWM linear limit', '0.5000'], ['SVPWM linear limit', '0.57735'], ['Analytic gain', '15.470%'],
        ['Common-mode injection', 'zero-sequence'], ['Phase-voltage equivalence', 'exact in linear range']
      ],
      chart() {
        const l = R.e02_svpwm.linear_limit;
        return {
          type: 'bar', labels: ['SPWM', 'SVPWM'], series: [{ name: 'm limit', values: [l.spwm, l.svpwm], color: '--teal' }],
          yLabel: 'Modulation index', yMin: 0, yMax: 0.65, formatY: (v) => v.toFixed(2), height: 220,
          summary: 'SVPWM reaches 0.577 while SPWM reaches 0.5, a 15.47 percent gain.'
        };
      }
    },
    {
      id: 'E3', key: 'e03_deadtime', title: 'Dead time creates low-order voltage error', metric: '2.079', unit: '× i5/i7',
      note: 'A 800 ns dead time at 10 kHz and m=0.4 produces a 3.5685 V fundamental error. The fifth harmonic is 2.079× the seventh, not the other way around.',
      values: [
        ['Dead time', '800 ns'], ['Switching frequency', '10 kHz'], ['m', '0.4'],
        ['i5', '0.1241%'], ['i7', '0.0597%'], ['i5/i7', '2.079'], ['Fundamental error', '3.5685 V']
      ],
      chart() {
        const b = R.e03_deadtime.base;
        return {
          type: 'bar', labels: ['i5', 'i7', 'dq6'], series: [{ name: '% of fundamental', values: [b.i5_pct, b.i7_pct, b.dq6_pct], color: '--violet' }],
          yLabel: 'Harmonic (% of fundamental)', yMin: 0, formatY: (v) => v.toFixed(3), height: 220,
          summary: 'The fifth harmonic is 0.124 percent, the seventh 0.060 percent, and the dq sixth 0.084 percent.'
        };
      }
    },
    {
      id: 'E4', key: 'e04_mt_speed', title: 'M/T observers switch domains at speed', metric: '600', unit: 'rpm crossover',
      note: 'At low speed the edge timer is long and position error dominates; at high speed one-sample delay dominates. The crossover is near 600 rpm.',
      values: [
        ['Table clock', '1 MHz'], ['Crossover', '600 rpm'], ['T-error at 601 rpm', '0.842%'],
        ['M-error at 601 rpm', '0.832%'], ['T-error at 10,000 rpm', '19.89%'], ['M-error at 10,000 rpm', '0.05%']
      ],
      chart() {
        const table = R.e04_mt_speed.tables['1MHz'].filter((row) => row.speed_rpm >= 37);
        return {
          type: 'line', x: table.map((row) => row.speed_rpm), labels: table.map((row) => compact(row.speed_rpm, 0)),
          series: [{ name: 'T error', values: table.map((row) => row.t_err_pct_max), color: '--red' }],
          xLog: true, xLabel: 'Speed (rpm, log scale)', yLabel: 'Worst T-error (%)',
          marks: [{ x: 600, label: 'crossover', color: '--amber' }], height: 220,
          summary: 'Torque error rises with speed after the 600 rpm crossover, reaching about 20 percent at 10,000 rpm.'
        };
      }
    },
    {
      id: 'E5', key: 'e05_kt_ke', title: 'Kt is a convention before it is a constant', metric: '0.030629', unit: 'N·m/A FOC',
      note: 'The same motor has three defensible Kt values: DC/peak, FOC peak, and RMS. They differ by 15.47% and 41.42%, not by measurement noise.',
      values: [
        ['Kt DC / peak', '0.035368 N·m/A'], ['Kt FOC peak', '0.030629 N·m/A'], ['Kt RMS', '0.043316 N·m/A'],
        ['DC vs FOC', '+15.470%'], ['RMS vs FOC', '+41.421%'], ['Datasheet vs FOC', '1.210%']
      ],
      chart() {
        const c = R.e05_kt_ke.constants;
        return {
          type: 'bar', labels: ['DC', 'FOC', 'RMS'], series: [{ name: 'Kt', values: [c.kt_dc_nm_per_a, c.kt_foc_peak_nm_per_a, c.kt_rms_nm_per_a], color: '--amber' }],
          yLabel: 'Kt (N·m/A)', yMin: 0, formatY: (v) => v.toFixed(3), height: 220,
          summary: 'DC, FOC peak, and RMS conventions give 0.0354, 0.0306, and 0.0433 Nm per amp.'
        };
      }
    },
    {
      id: 'E6', key: 'e06_i2c', title: 'The 4.7 kΩ pull-up is a 100 kHz component', metric: '251', unit: 'pF at 4.7 kΩ',
      note: 'At 3.3 V, a 4.7 kΩ pull-up limits bus capacitance to 251 pF in Standard mode, 75 pF in Fast mode, and 30 pF in Fast-mode Plus. Fast mode at 400 pF has no legal resistor window.',
      values: [
        ['Rp min at 3.3 V, 3 mA', '966.7 Ω'], ['Rp max at 400 pF, Fast', '885 Ω'], ['Fast at 400 pF', 'infeasible'],
        ['4.7 kΩ max Cb, Standard', '251 pF'], ['4.7 kΩ max Cb, Fast', '75 pF'], ['4.7 kΩ max Cb, FM+', '30 pF']
      ],
      chart() {
        const f = R.e06_i2c.four_seven_k;
        return {
          type: 'bar', labels: ['Standard', 'Fast', 'FM+'], series: [{ name: 'max Cb', values: [f.standard.max_cb_pf, f.fast.max_cb_pf, f.fmplus.max_cb_pf], color: '--teal' }],
          yLabel: 'Max bus capacitance at 4.7 kΩ (pF)', yMin: 0, formatY: (v) => v.toFixed(0), height: 220,
          summary: 'A 4.7k pull-up supports 251 pF in Standard mode, 75 pF in Fast mode, and 30 pF in Fast-mode Plus.'
        };
      }
    },
    {
      id: 'E7', key: 'e07_rs485', title: 'Failsafe bias must include the receiver load', metric: '183.2', unit: 'mV loaded',
      note: 'A 680 Ω bias at 5 V looks fine unloaded at 211 mV. With 32 unit loads the bus falls to 51.7 Ω and the same bias produces 183 mV, below the 200 mV threshold.',
      values: [
        ['5 V, 680 Ω, no load', '211.27 mV'], ['5 V, 680 Ω, 32 UL', '183.19 mV'], ['5 V, 560 Ω, 32 UL', '220.72 mV'],
        ['3.3 V, 430 Ω, 32 UL', '187.22 mV'], ['3.3 V, 390 Ω, 32 UL', '205.22 mV'], ['Minimum Vab', '200 mV']
      ],
      chart() {
        const c = R.e07_rs485.cases;
        return {
          type: 'bar', labels: ['5V 680\nno load', '5V 680\n32 UL', '5V 560\n32 UL', '3V3 430\n32 UL', '3V3 390\n32 UL'],
          series: [{ name: 'Vab', values: [c['5v_680_no_load'] * 1000, c['5v_680_full_load'] * 1000, c['5v_560_full_load'] * 1000, c['3v3_430_full_load'] * 1000, c['3v3_390_full_load'] * 1000], color: '--amber' }],
          yLabel: 'Differential bias (mV)', yMin: 0, yMax: 250, yMark: 200, yMarkLabel: '200 mV threshold', formatY: (v) => v.toFixed(0), height: 220,
          summary: 'Loaded bias voltages fall below 200 mV for 5V/680 and 3.3V/430; 5V/560 and 3.3V/390 pass.'
        };
      }
    },
    {
      id: 'E8', key: 'e08_ipc', title: 'IPC-2221 and IPC-2152 disagree by 2×', metric: '2.114', unit: '× wider at 10 A',
      note: 'At 10 A, 10 °C rise, 1 oz, IPC-2221 asks for 7.19 mm external. The IPC-2152 fit asks for 15.21 mm, and a 2026 chart reading asks for 18.7 mm.',
      values: [
        ['IPC-2221 external', '7.194 mm'], ['IPC-2152 fit external', '15.207 mm'], ['IPC-2152 chart external', '18.700 mm'],
        ['Fit / 2221', '2.114×'], ['Chart / 2221', '2.599×'], ['IPC-2221 internal / external', '2.601×']
      ],
      chart() {
        const c = R.e08_ipc.case_10a_10c;
        return {
          type: 'bar', labels: ['2221 ext', '2152 ext', '2152 chart', '2152 int'], series: [{ name: 'width', values: [c.ipc2221_ext_mm, c.ipc2152_ext_fit_mm, c.ipc2152_ext_chart_mm, c.ipc2152_int_fit_mm], color: '--violet' }],
          yLabel: 'Trace width at 10 A, 10 °C (mm)', yMin: 0, formatY: (v) => v.toFixed(1), height: 220,
          summary: 'IPC-2221 gives 7.2 mm, the IPC-2152 fit 15.2 mm, the chart 18.7 mm, and the internal fit 13.3 mm.'
        };
      }
    },
    {
      id: 'E9', key: 'e09_hbridge', title: 'Half-bridge ripple depends on the drive scheme', metric: '0.375', unit: '× bipolar',
      note: 'At m=0.6 the same half bridge gives 0.1540 A peak-to-peak in bipolar, 0.1155 A in unipolar single, and 0.0580 A in dual aligned. The 2m/(1+m) rule belongs to one scheme, not all.',
      values: [
        ['Bipolar ripple', '0.1540 A'], ['Unipolar single', '0.1155 A'], ['Dual aligned', '0.0580 A'],
        ['Dual aligned / bipolar', '0.375'], ['Single / bipolar', '0.750'], ['Formula 2m/(1+m), m=0.6', '0.750']
      ],
      chart() {
        const s = R.e09_hbridge.schemes;
        return {
          type: 'bar', labels: s.map((row) => row.scheme.replaceAll('_', ' ')), series: [{ name: 'ripple ratio', values: s.map((row) => row.ripple_ratio_to_bipolar), color: '--teal' }],
          yLabel: 'Ripple / bipolar ripple', yMin: 0, formatY: (v) => v.toFixed(2), height: 220,
          summary: 'Unipolar single is 0.75 of bipolar ripple, dual aligned is 0.375, and dual shifted is about 1.0.'
        };
      }
    },
    {
      id: 'E10', key: 'e10_paderborn', title: 'The torque channel is not an independent sensor', metric: '1.4238', unit: 'apparent η',
      note: 'Using P=udid+uquq without the 1.5 factor gives a median apparent efficiency of 142%, which is impossible. The voltage channel is the independent evidence; the torque channel is consistent with a fixed-parameter model.',
      values: [
        ['Rows', '1,330,816'], ['Motoring rows', '472,226'], ['Apparent efficiency, no 1.5', '142.38%'],
        ['Median efficiency, 1.5', '94.92%'], ['5th–95th percentile, 1.5', '100.8–111.7%'], ['Voltage→torque RMSE', '4.00 N·m']
      ],
      chart() {
        const p = R.e10_paderborn.power_balance;
        return {
          type: 'bar', labels: ['no 1.5', 'with 1.5'], series: [{ name: 'median η', values: [p.median_apparent_efficiency_1p0 * 100, p.median_efficiency_1p5 * 100], color: '--amber' }],
          yLabel: 'Median apparent efficiency (%)', yMin: 0, yMax: 160, yMark: 100, yMarkLabel: 'physical limit', formatY: (v) => v.toFixed(0), height: 220,
          summary: 'Without the 1.5 factor the data imply 142 percent efficiency; with it, 94.9 percent.'
        };
      }
    }
  ];

  const EXP_BY_ID = Object.fromEntries(EXP.map((entry) => [entry.id, entry]));

  function kpiMarkup() {
    const fields = M.verified_fields || D.verification?.fields_checked || 0;
    return [
      ['Claims audited', String(M.claims), `${M.counts.supported} supported · ${M.counts.qualified} qualified · ${M.counts.refuted} refuted`],
      ['Experiments', String(M.experiments), 'one executable artifact each'],
      ['Verified fields', fields ? compact(fields, 0) : 'pending', 'compared field by field'],
      ['Real-data hours', fmt(M.dataset.duration_h, 1), `${compact(M.dataset.rows, 0)} rows · ${M.dataset.profiles} profiles`]
    ].map(([label, value, sub]) => `<div class="kpi"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div><div class="kpi-sub">${esc(sub)}</div></div>`).join('');
  }

  function renderOverview() {
    $('#kpiRow').innerHTML = kpiMarkup();
    const counts = M.counts;
    $('#claimsPill').textContent = `${M.claims} claims`;
    $('#donutTotal').textContent = M.claims;
    $('#verdictLegend').innerHTML = [
      ['supported', 'Supported', 'Holds at the stated point'],
      ['qualified', 'Qualified', 'Right only with a missing condition'],
      ['refuted', 'Refuted', 'Fails under the implied conditions']
    ].map(([key, label, sub]) => `<div class="legend-item"><span class="legend-dot" style="background:var(${VERDICT_COLORS[key]})"></span><span>${label}<small>${sub}</small></span><strong>${counts[key]}</strong></div>`).join('');
    registerChart($('#verdictDonut'), {
      type: 'donut', segments: [
        { label: 'supported', value: counts.supported, color: '--green' },
        { label: 'qualified', value: counts.qualified, color: '--amber' },
        { label: 'refuted', value: counts.refuted, color: '--red' }
      ]
    });

    $('#patternGrid').innerHTML = [
      ['01', 'Denominator drift', '13.4% of peak becomes 14.0% of mean. Both are true; only one belongs in the sentence.', 'E1 · C01'],
      ['02', 'Missing load', '680 Ω passes at 211 mV unloaded and fails at 183 mV with 32 unit loads.', 'E7 · C14'],
      ['03', 'Convention trap', 'The same motor is 0.03537 or 0.03063 N·m/A depending on the transform.', 'E5 · C10'],
      ['04', 'Regime change', 'IPC-2221 is 2.1× narrower than IPC-2152 at 10 A, but nearly agrees at 1 A.', 'E8 · C16'],
      ['05', 'Provenance', 'The Paderborn torque channel is derived. Its temperature slope cannot calibrate Kt.', 'E10 · C20']
    ].map(([num, title, text, tag]) => `<article class="pattern"><div class="pattern-num">${num}</div><h3>${title}</h3><p>${text}</p><span class="pattern-tag">${tag}</span></article>`).join('');

    const maxCount = Math.max(...EXP.map((entry) => experimentSeries(entry.id).length));
    $('#evidenceMap').innerHTML = EXP.map((entry) => {
      const claims = experimentSeries(entry.id);
      const countsForExp = ['supported', 'qualified', 'refuted'].map((key) => claims.filter((claim) => claim.verdict === key).length);
      return `<button class="evidence-row" data-exp="${entry.id}" aria-label="Open experiment ${entry.id}">
        <span class="eid">${entry.id}</span><span class="ename">${esc(entry.title)}</span>
        <span class="verdict-bars" aria-hidden="true">${countsForExp.map((count, index) => `<span style="width:${(count / Math.max(1, maxCount)) * 100}%;background:var(${VERDICT_COLORS[['supported', 'qualified', 'refuted'][index]]})"></span>`).join('')}</span>
      </button>`;
    }).join('');

    const v = D.verification || {};
    const fields = v.fields_checked || M.verified_fields || 0;
    const diff = v.max_relative_difference ?? M.max_relative_difference;
    $('#verifyFields').textContent = fields ? compact(fields, 0) : 'pending';
    $('#verifyDiff').textContent = diff === null || diff === undefined ? 'pending' : Number(diff).toExponential(3);
    $('#verifyExps').textContent = v.experiments_checked || 0;
    $('#verifyRows').textContent = compact(M.dataset.rows, 0);
    const passed = Boolean(v.passed) || Boolean(M.verification_passed);
    const pill = $('#verifyPill');
    pill.textContent = passed ? 'verified' : 'run make verify';
    pill.style.color = passed ? 'var(--green)' : 'var(--amber)';
    pill.style.borderColor = passed ? 'rgba(113,230,168,.35)' : 'rgba(242,181,68,.35)';
    $('#sideFields').textContent = fields ? `${compact(fields, 0)} fields` : 'verification pending';
    $('#sideDiff').textContent = diff === null || diff === undefined ? 'run make verify' : `max difference ${Number(diff).toExponential(3)}`;
  }

  function fillExperimentFilter() {
    const select = $('#experimentFilter');
    EXP.forEach((entry) => {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = `${entry.id} — ${entry.title}`;
      select.appendChild(option);
    });
  }

  let claimState = { verdict: 'all', experiment: 'all', query: '' };

  function claimMatches(claim) {
    if (claimState.verdict !== 'all' && claim.verdict !== claimState.verdict) return false;
    if (claimState.experiment !== 'all' && claim.experiment !== claimState.experiment) return false;
    const query = claimState.query.trim().toLowerCase();
    if (!query) return true;
    return `${claim.id} ${claim.claim} ${claim.note} ${claim.experiment}`.toLowerCase().includes(query);
  }

  function renderClaims() {
    const rows = CLAIMS.filter(claimMatches);
    $('#claimCount').textContent = `${rows.length} of ${CLAIMS.length} claims`;
    $('#claimEmpty').hidden = rows.length > 0;
    $('#claimRows').innerHTML = rows.map((claim) => `<tr data-claim="${claim.id}">
      <td><span class="claim-id">${claim.id}</span></td>
      <td class="claim-text"><button data-claim-open="${claim.id}">${esc(claim.claim)}</button></td>
      <td><span class="claim-exp">${claim.experiment}</span></td>
      <td><span class="claim-num">${esc(claim.observed)}${claim.unit ? `${claim.unit === '%' || claim.unit === '×' ? '' : ' '}${esc(claim.unit)}` : ''}</span></td>
      <td><span class="claim-num">${esc(claim.comparison)}</span></td>
      <td>${verdictBadge(claim.verdict)}</td>
      <td><button class="row-open" data-claim-open="${claim.id}" aria-label="Open ${claim.id}">↗</button></td>
    </tr>`).join('');
    $$('#verdictFilter .seg-btn').forEach((button) => {
      const active = button.dataset.filter === claimState.verdict;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function openClaim(id) {
    const claim = CLAIMS.find((entry) => entry.id === id);
    if (!claim) return;
    const experiment = EXP_BY_ID[claim.experiment];
    const related = experimentSeries(claim.experiment);
    const body = `
      <h2 id="drawerTitle">${esc(claim.claim)}</h2>
      <div class="drawer-grid">
        <div class="drawer-stat"><span>Verdict</span><strong>${verdictBadge(claim.verdict)}</strong></div>
        <div class="drawer-stat"><span>Experiment</span><strong>${claim.experiment}</strong></div>
        <div class="drawer-stat"><span>Observed</span><strong>${esc(claim.observed)}${claim.unit ? `${claim.unit === '%' || claim.unit === '×' ? '' : ' '}${esc(claim.unit)}` : ''}</strong></div>
        <div class="drawer-stat"><span>Source sentence</span><strong>${esc(claim.comparison)}</strong></div>
      </div>
      <p class="drawer-note">${esc(claim.note)}</p>
      <div class="drawer-code">results.json → ${esc(claim.path.join(' → '))}</div>
      <div class="drawer-actions">
        <button class="btn primary" data-exp="${claim.experiment}">Open ${claim.experiment}</button>
        <a class="btn" href="${M.repo_url}/blob/main/src/eca/${SOURCE[claim.experiment]}" target="_blank" rel="noopener">Source ↗</a>
        <button class="btn" data-copy="${esc(claim.path.join('.'))}">Copy JSON path</button>
      </div>
      <p class="fine" style="margin-top:16px">${related.length} claim${related.length === 1 ? '' : 's'} share this experiment. A verdict is not a vote: it is the result of re-running the model at the stated operating point.</p>`;
    openDrawer(body, `Claim ${claim.id}`, `Claim ${claim.id}`);
  }

  function openExperiment(id) {
    const entry = EXP_BY_ID[id];
    if (!entry) return;
    const chartSpec = entry.chart();
    const claims = experimentSeries(id);
    const body = `
      <h2 id="drawerTitle">${esc(entry.title)}</h2>
      <p class="drawer-note">${esc(entry.note)}</p>
      <figure class="drawer-chart"><canvas id="experimentChart" role="img" aria-label="${esc(chartSpec.summary || entry.title)}"></canvas><figcaption>${esc(chartSpec.summary || '')}</figcaption></figure>
      <div class="drawer-grid">${entry.values.map(([label, value]) => `<div class="drawer-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>
      <div class="drawer-actions">
        <a class="btn" href="${M.repo_url}/blob/main/src/eca/${SOURCE[id]}" target="_blank" rel="noopener">Read the model ↗</a>
        ${claims.length ? `<button class="btn" data-filter-exp="${id}">Filter ${claims.length} claim${claims.length === 1 ? '' : 's'}</button>` : ''}
      </div>
      <div style="margin-top:18px"><p class="eyebrow">Hidden pattern</p><p class="drawer-note">${esc(R[entry.key].hidden_pattern || '')}</p></div>`;
    openDrawer(body, `Experiment ${entry.id}`, `Experiment ${entry.id}`);
    requestAnimationFrame(() => {
      const canvas = $('#experimentChart');
      if (canvas) drawChart(canvas, chartSpec);
    });
  }

  function openDrawer(html, title, kind) {
    lastFocus = document.activeElement;
    $('#drawerBody').innerHTML = html;
    $('#drawerKind').textContent = kind;
    $('#drawer').classList.add('open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    $('#scrim').hidden = false;
    $('#drawer').focus();
    document.title = `${title} — Embedded Claims Audit`;
  }

  function closeDrawer() {
    $('#drawer').classList.remove('open');
    $('#drawer').setAttribute('aria-hidden', 'true');
    $('#scrim').hidden = true;
    document.title = 'Embedded Claims Audit — Live Console';
    if (lastFocus && lastFocus.isConnected) lastFocus.focus();
  }

  function renderExperiments() {
    $('#experimentGrid').innerHTML = EXP.map((entry) => {
      const claims = experimentSeries(entry.id);
      const counts = ['supported', 'qualified', 'refuted'].map((key) => claims.filter((claim) => claim.verdict === key).length);
      const total = counts.reduce((sum, count) => sum + count, 0);
      return `<button class="exp-card" data-exp="${entry.id}">
        <div class="exp-top"><span class="exp-id">${entry.id}</span><span class="pill">${claims.length} claim${claims.length === 1 ? '' : 's'}</span></div>
        <h3>${esc(entry.title)}</h3>
        <div class="exp-metric"><strong>${esc(entry.metric)}</strong><span>${esc(entry.unit)}</span></div>
        <div class="exp-foot">${counts.map((count, index) => count ? `<span class="mini-dot ${['supported', 'qualified', 'refuted'][index]}" title="${count} ${['supported', 'qualified', 'refuted'][index]}"></span>` : '').join('')}<small>${total} finding${total === 1 ? '' : 's'}</small></div>
      </button>`;
    }).join('');
  }

  function labControl(label, id, min, max, step, value, unit, type = 'range') {
    if (type === 'select') return `<div class="control"><label for="${id}">${label}</label><select id="${id}">${value}</select></div>`;
    return `<div class="control"><label for="${id}">${label}</label><div class="control-row"><input type="number" id="${id}Num" min="${min}" max="${max}" step="${step}" value="${value}"><span class="fine">${unit}</span></div><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"></div>`;
  }

  function labStat(label, id) {
    return `<div class="lab-stat"><span>${label}</span><strong id="${id}">—</strong></div>`;
  }

  function renderLab() {
    const kt = R.e05_kt_ke.constants;
    const sweep = R.e01_sixstep.misalignment.sweep;
    $('#labGrid').innerHTML = `
      <article class="lab-card" data-lab="alignment">
        <div class="lab-head"><div><p class="eyebrow">E1 · alignment</p><h3>Six-step ripple</h3></div><span class="lab-badge">closed form</span></div>
        ${labControl('Commutation error', 'alignAngle', -30, 30, 0.5, 18, 'deg')}
        ${labControl('Current command', 'alignCurrent', 20, 120, 1, 80, 'A')}
        <div class="lab-out">${labStat('Peak ripple', 'alignPeak')}${labStat('Mean ripple', 'alignMean')}${labStat('Mean torque', 'alignTorque')}</div>
        <p class="lab-note" id="alignNote">Move the alignment error. At 30° half the waveform is missing.</p>
      </article>
      <article class="lab-card" data-lab="deadtime">
        <div class="lab-head"><div><p class="eyebrow">E3 · dead time</p><h3>Low-order harmonics</h3></div><span class="lab-badge">scaled model</span></div>
        ${labControl('Dead time', 'dtNs', 0, 1500, 25, 800, 'ns')}
        ${labControl('Modulation index', 'dtM', 0.1, 0.9, 0.01, 0.4, '')}
        <div class="lab-out">${labStat('i5', 'dtI5')}${labStat('i7', 'dtI7')}${labStat('i5 / i7', 'dtRatio')}</div>
        <p class="lab-note" id="dtNote">The fifth harmonic grows linearly with dead time and inversely with modulation index.</p>
      </article>
      <article class="lab-card" data-lab="i2c">
        <div class="lab-head"><div><p class="eyebrow">E6 · I2C</p><h3>Pull-up window</h3></div><span class="lab-badge">Rp min / max</span></div>
        <div class="control"><label for="i2cVdd">Supply</label><select id="i2cVdd"><option value="1.8">1.8 V</option><option value="3.3" selected>3.3 V</option><option value="5">5.0 V</option></select></div>
        <div class="control"><label for="i2cMode">Mode</label><select id="i2cMode"><option value="standard">Standard 100 kHz</option><option value="fast" selected>Fast 400 kHz</option><option value="fmplus">Fast-mode Plus 1 MHz</option></select></div>
        ${labControl('Bus capacitance', 'i2cCb', 10, 800, 5, 400, 'pF')}
        <div class="lab-out">${labStat('Rp min', 'i2cMin')}${labStat('Rp max', 'i2cMax')}${labStat('Verdict', 'i2cPass')}</div>
        <p class="lab-note" id="i2cNote">Fast mode at 400 pF and 3.3 V with a 3 mA sink has no legal resistor window.</p>
      </article>
      <article class="lab-card" data-lab="rs485">
        <div class="lab-head"><div><p class="eyebrow">E7 · RS-485</p><h3>Failsafe bias</h3></div><span class="lab-badge">200 mV</span></div>
        <div class="control"><label for="rsVdd">Supply</label><select id="rsVdd"><option value="3.3">3.3 V</option><option value="5" selected>5.0 V</option></select></div>
        ${labControl('Bias resistor', 'rsBias', 330, 1200, 10, 680, 'Ω')}
        <div class="control"><label for="rsLoad">Receiver load</label><select id="rsLoad"><option value="0">No load</option><option value="32" selected>32 unit loads</option></select></div>
        <div class="lab-out">${labStat('Vab', 'rsVab')}${labStat('Margin', 'rsMargin')}${labStat('R max', 'rsMax')}</div>
        <p class="lab-note" id="rsNote">The 32-unit-load receiver input sits in parallel with the 60 Ω termination.</p>
      </article>
      <article class="lab-card" data-lab="trace">
        <div class="lab-head"><div><p class="eyebrow">E8 · PCB</p><h3>Trace width</h3></div><span class="lab-badge">IPC-2221 vs 2152</span></div>
        ${labControl('Current', 'ipcCurrent', 1, 20, 0.5, 10, 'A')}
        ${labControl('Temperature rise', 'ipcDt', 5, 60, 1, 10, '°C')}
        <div class="control"><label for="ipcLayer">Layer</label><select id="ipcLayer"><option value="ext" selected>External</option><option value="int">Internal</option></select></div>
        <div class="control"><label for="ipcOz">Copper</label><select id="ipcOz"><option value="1" selected>1 oz</option><option value="2">2 oz</option></select></div>
        <div class="lab-out">${labStat('IPC-2221', 'ipc2221')}${labStat('IPC-2152 fit', 'ipc2152')}${labStat('2152 / 2221', 'ipcRatio')}</div>
        <p class="lab-note" id="ipcNote">At 10 A the two published methods differ by about a factor of two.</p>
      </article>
      <article class="lab-card" data-lab="kt">
        <div class="lab-head"><div><p class="eyebrow">E5 · Kt</p><h3>Torque constant</h3></div><span class="lab-badge">three conventions</span></div>
        ${labControl('Kv', 'ktKv', 50, 1000, 5, 270, 'rpm/V')}
        <div class="control"><label for="ktConv">Convention</label><select id="ktConv"><option value="foc" selected>FOC peak</option><option value="dc">DC / peak</option><option value="rms">RMS</option></select></div>
        ${labControl('Current', 'ktCurrent', 10, 150, 1, 80, 'A')}
        <div class="lab-out">${labStat('Kt', 'ktValue')}${labStat('Torque', 'ktTorque')}${labStat('vs FOC', 'ktDiff')}</div>
        <p class="lab-note" id="ktNote">The same motor can be quoted at 0.0354 or 0.0306 N·m/A without either number being wrong.</p>
      </article>`;

    bindLab(sweep, kt);
  }

  function syncRange(id, outputId) {
    const range = $(`#${id}`);
    const number = $(`#${id}Num`);
    const set = (value) => {
      const numeric = Number(value);
      const min = Number(range.min);
      const max = Number(range.max);
      const clamped = Math.min(max, Math.max(min, numeric));
      range.value = clamped;
      if (number) number.value = clamped;
      if (outputId) $(`#${outputId}`).textContent = clamped;
      return clamped;
    };
    range.addEventListener('input', () => { set(range.value); range.dispatchEvent(new CustomEvent('labchange')); });
    if (number) number.addEventListener('input', () => { set(number.value); range.dispatchEvent(new CustomEvent('labchange')); });
    return set;
  }

  function bindLab(sweep, kt) {
    const alignAngle = syncRange('alignAngle');
    const alignCurrent = syncRange('alignCurrent');
    const updateAlign = () => {
      const angle = Number($('#alignAngle').value);
      const current = Number($('#alignCurrent').value);
      const nearest = sweep.reduce((best, point) => Math.abs(point.delta_deg - angle) < Math.abs(best.delta_deg - angle) ? point : best, sweep[0]);
      const peak = nearest.pct_of_peak;
      const mean = nearest.pct_of_mean;
      const torque = kt.kt_foc_peak_nm_per_a * current;
      $('#alignPeak').textContent = pct(peak, 2);
      $('#alignMean').textContent = pct(mean, 2);
      $('#alignTorque').textContent = `${fmt(torque * (1 - peak / 200), 2)} N·m`;
      const note = $('#alignNote');
      note.textContent = Math.abs(angle) <= 1 ? 'Aligned: the 13.4% figure is a property of the waveform, not the load.' : Math.abs(angle) >= 20 ? 'Large error: the drive is losing whole commutation intervals. The ripple is now a control fault, not a motor constant.' : 'The peak and mean denominators diverge as the alignment error grows.';
      note.className = `lab-note ${Math.abs(angle) <= 1 ? 'good' : Math.abs(angle) >= 20 ? 'bad' : ''}`;
    };
    $('#alignAngle').addEventListener('labchange', updateAlign);
    $('#alignCurrent').addEventListener('labchange', updateAlign);
    alignAngle(18); alignCurrent(80); updateAlign();

    const dtNs = syncRange('dtNs');
    const dtM = syncRange('dtM');
    const updateDt = () => {
      const td = Number($('#dtNs').value);
      const m = Math.max(0.05, Number($('#dtM').value));
      const i5 = 0.12405142161740208 * (td / 800) * (0.4 / m);
      const i7 = i5 / 2.0786595168101845;
      $('#dtI5').textContent = pct(i5, 3);
      $('#dtI7').textContent = pct(i7, 3);
      $('#dtRatio').textContent = fmt(i5 / Math.max(0.0001, i7), 2);
      $('#dtNote').textContent = td === 0 ? 'Zero dead time removes the low-order error, but a real bridge cannot guarantee that.' : `A ${td} ns dead time produces ${pct(i5, 3)} fifth harmonic at m=${m.toFixed(2)}.`;
      $('#dtNote').className = `lab-note ${i5 > 0.3 ? 'bad' : i5 < 0.08 ? 'good' : ''}`;
    };
    $('#dtNs').addEventListener('labchange', updateDt);
    $('#dtM').addEventListener('labchange', updateDt);
    dtNs(800); dtM(0.4); updateDt();

    const modes = {
      standard: { tr: 1000e-9, cbMax: 400e-12, iol: 3e-3, vol: 0.4 },
      fast: { tr: 300e-9, cbMax: 400e-12, iol: 3e-3, vol: 0.4 },
      fmplus: { tr: 120e-9, cbMax: 550e-12, iol: 20e-3, vol: 0.4 }
    };
    const i2cCb = syncRange('i2cCb');
    const updateI2c = () => {
      const vdd = Number($('#i2cVdd').value);
      const mode = modes[$('#i2cMode').value];
      const cb = Number($('#i2cCb').value) * 1e-12;
      const lo = (vdd - mode.vol) / mode.iol;
      const hi = mode.tr / (Math.log(7 / 3) * Math.max(1e-15, cb));
      const feasible = hi > lo && cb <= mode.cbMax + 1e-15;
      $('#i2cMin').textContent = `${compact(lo, 0)} Ω`;
      $('#i2cMax').textContent = feasible ? `${compact(hi, 0)} Ω` : `${compact(hi, 0)} Ω`;
      $('#i2cPass').textContent = feasible ? 'legal' : 'no solution';
      $('#i2cPass').style.color = feasible ? 'var(--green)' : 'var(--red)';
      const note = $('#i2cNote');
      note.textContent = feasible ? `Choose a resistor between ${compact(lo, 0)} Ω and ${compact(hi, 0)} Ω.` : `No resistor can satisfy both constraints: Rp_min ${compact(lo, 0)} Ω is above Rp_max ${compact(hi, 0)} Ω${cb > mode.cbMax ? ', and the capacitance exceeds the mode limit' : ''}.`;
      note.className = `lab-note ${feasible ? 'good' : 'bad'}`;
    };
    ['i2cVdd', 'i2cMode'].forEach((id) => $(`#${id}`).addEventListener('change', updateI2c));
    $('#i2cCb').addEventListener('labchange', updateI2c);
    i2cCb(400); updateI2c();

    const rsBias = syncRange('rsBias');
    const updateRs = () => {
      const vdd = Number($('#rsVdd').value);
      const bias = Number($('#rsBias').value);
      const loads = Number($('#rsLoad').value);
      const rLoad = loads ? 375 : null;
      const rBus = rLoad ? 1 / (1 / 60 + 1 / rLoad) : 60;
      const vab = vdd * rBus / (2 * bias + rBus);
      const rMax = (vdd * rBus / 0.2 - rBus) / 2;
      $('#rsVab').textContent = `${fmt(vab * 1000, 0)} mV`;
      $('#rsMargin').textContent = `${fmt((vab - 0.2) * 1000, 0)} mV`;
      $('#rsMax').textContent = `${compact(rMax, 0)} Ω`;
      $('#rsVab').style.color = vab >= 0.2 ? 'var(--green)' : 'var(--red)';
      const note = $('#rsNote');
      note.textContent = vab >= 0.2 ? `Passes with ${fmt((vab - 0.2) * 1000, 0)} mV margin. The maximum legal bias is ${compact(rMax, 0)} Ω.` : `Fails: ${fmt((0.2 - vab) * 1000, 0)} mV short. The load lowered the bus resistance, so the same bias produces less voltage.`;
      note.className = `lab-note ${vab >= 0.2 ? 'good' : 'bad'}`;
    };
    ['rsVdd', 'rsLoad'].forEach((id) => $(`#${id}`).addEventListener('change', updateRs));
    $('#rsBias').addEventListener('labchange', updateRs);
    rsBias(680); updateRs();

    const ipcCurrent = syncRange('ipcCurrent');
    const ipcDt = syncRange('ipcDt');
    const ipc2221 = (i, dt, ext, oz) => {
      const k = ext ? 0.048 : 0.024;
      const area = Math.pow(i / (k * Math.pow(dt, 0.44)), 1 / 0.725);
      return area / (oz * 1.378) * 0.0254;
    };
    const ipc2152 = (i, dt, ext, oz) => {
      const [k, a, b, c] = ext ? [215.3, 2.0, -1.15, -1.0] : [200.0, 1.9, -1.10, -1.52];
      return Math.pow(dt / (k * Math.pow(i, a) * Math.pow(oz * 1.378, c)), 1 / b) * 0.0254;
    };
    const updateIpc = () => {
      const current = Number($('#ipcCurrent').value);
      const dt = Number($('#ipcDt').value);
      const ext = $('#ipcLayer').value === 'ext';
      const oz = Number($('#ipcOz').value);
      const w1 = ipc2221(current, dt, ext, oz);
      const w2 = ipc2152(current, dt, ext, oz);
      $('#ipc2221').textContent = `${fmt(w1, 2)} mm`;
      $('#ipc2152').textContent = `${fmt(w2, 2)} mm`;
      $('#ipcRatio').textContent = `${fmt(w2 / w1, 2)}×`;
      $('#ipcNote').textContent = `At ${fmt(current, 1)} A and ${fmt(dt, 0)} °C rise the IPC-2152 fit is ${fmt(w2 / w1, 2)}× the IPC-2221 width. The disagreement is largest at high current.`;
      $('#ipcNote').className = `lab-note ${w2 / w1 > 1.6 ? 'bad' : w2 / w1 < 1.2 ? 'good' : ''}`;
    };
    ['ipcLayer', 'ipcOz'].forEach((id) => $(`#${id}`).addEventListener('change', updateIpc));
    $('#ipcCurrent').addEventListener('labchange', updateIpc);
    $('#ipcDt').addEventListener('labchange', updateIpc);
    ipcCurrent(10); ipcDt(10); updateIpc();

    const ktKv = syncRange('ktKv');
    const ktCurrent = syncRange('ktCurrent');
    const updateKt = () => {
      const kv = Number($('#ktKv').value);
      const convention = $('#ktConv').value;
      const current = Number($('#ktCurrent').value);
      const constants = { dc: kt.dc_rule_per_kv, foc: kt.foc_rule_per_kv, rms: kt.rms_rule_per_kv };
      const value = constants[convention] / kv;
      const focValue = kt.foc_rule_per_kv / kv;
      $('#ktValue').textContent = `${fmt(value, 5)}`;
      $('#ktTorque').textContent = `${fmt(value * current, 2)} N·m`;
      $('#ktDiff').textContent = `${value === focValue ? 'ref' : `${value > focValue ? '+' : ''}${fmt((value / focValue - 1) * 100, 2)}%`}`;
      $('#ktNote').textContent = convention === 'foc' ? 'FOC peak uses the amplitude-invariant transform. This is the convention the paper uses for control.' : convention === 'dc' ? 'DC/peak convention is 15.47% higher than FOC peak. A datasheet can quote either.' : 'RMS convention is 41.42% higher than FOC peak because it multiplies by √2.';
    };
    $('#ktConv').addEventListener('change', updateKt);
    $('#ktKv').addEventListener('labchange', updateKt);
    $('#ktCurrent').addEventListener('labchange', updateKt);
    ktKv(270); ktCurrent(80); updateKt();
  }

  const MODULES = [
    ['01', 'A number without a denominator is a rumor', 'The same six-step waveform has 13.4% ripple of peak and 14.0% of mean. Both fractions are correct; the sentence becomes testable only when the denominator is named.', 'E1'],
    ['02', 'The load is part of the circuit', 'A 680 Ω failsafe bias produces 211 mV with no receiver and 183 mV with 32 unit loads. The hidden 375 Ω receiver input is the difference between a passing and a failing design.', 'E7'],
    ['03', 'A convention is part of the constant', 'Kt is 0.03537 N·m/A in the DC/peak convention and 0.03063 N·m/A in the FOC peak convention. The 15.47% gap is not tolerance; it is the transform.', 'E5'],
    ['04', 'Every model has a regime', 'IPC-2221 and IPC-2152 almost agree at 1 A and diverge by 2.1× at 10 A. M/T observers cross over near 600 rpm. Extrapolating outside the tested point is the error.', 'E8'],
    ['05', 'Provenance beats precision', 'The Paderborn torque channel is derived from commanded currents and voltages. Its temperature slope cannot independently calibrate Kt; the voltage channel is the independent evidence.', 'E10'],
    ['06', 'Make the artifact executable', 'A claim becomes reproducible when a reader can run the model, see the operating point, and compare the output against a stored tolerance. The paper is a view of the artifact, not a substitute for it.', 'All']
  ];

  const GLOSSARY = [
    ['Peak vs mean', 'The denominator of a ripple or error fraction. A peak-normalized value is smaller than the same mean-normalized value.'],
    ['Modulation index', 'The ratio of commanded fundamental voltage to the inverter’s maximum linear voltage. SPWM stops at 0.5; SVPWM at 1/√3.'],
    ['Dead time', 'A blanking interval that prevents shoot-through. It distorts the applied voltage and creates fifth and seventh harmonics.'],
    ['Kt / Kv', 'Torque and voltage constants. Their numeric value depends on whether currents and voltages are peak, RMS, line-line, or transformed.'],
    ['Unit load', 'A normalized RS-485 receiver input. 32 unit loads are about 375 Ω in parallel with the terminated bus.'],
    ['IPC-2221 / 2152', 'Two PCB trace-sizing methods. The older standard uses a simple power law; the newer empirical fit predicts wider external traces at high current.'],
    ['dq transform', 'A rotating-frame transform. The amplitude-invariant version keeps power as 1.5(udid + uquq); omitting 1.5 produces impossible efficiency.'],
    ['Provenance', 'Where a number comes from: measured, derived, assumed, or copied. Precision does not repair unknown provenance.']
  ];

  const QUIZ = [
    { q: 'A six-step drive has 13.4% torque ripple “of peak.” What is the same ripple as a fraction of mean torque?', options: ['13.4%', '14.03%', '11.55%', 'It cannot be converted'], answer: 1, why: 'The same 0.2321 peak-to-peak ripple is 13.40% of the 1.7321 peak and 14.03% of the 1.6540 mean. The denominator changed; the ripple did not.' },
    { q: 'SVPWM’s linear modulation limit is 1/√3. What is the gain over SPWM’s 0.5?', options: ['7.7%', '15.47%', '33.3%', '41.4%'], answer: 1, why: '(1/√3)/0.5 − 1 = 2/√3 − 1 = 15.47%.' },
    { q: 'A 5 V RS-485 failsafe network uses 680 Ω bias resistors and 60 Ω termination. It measures 211 mV unloaded. What happens with 32 unit loads?', options: ['It stays at 211 mV', 'It rises above 211 mV', 'It falls to about 183 mV and fails', 'The termination disappears'], answer: 2, why: 'The 375 Ω receiver load parallels the 60 Ω bus, reducing it to 51.7 Ω and the bias to 183 mV.' },
    { q: 'A 4.7 kΩ I2C pull-up at 3.3 V is used at 400 pF. Is it legal in Fast mode?', options: ['Yes, 4.7 k is universal', 'Yes, if the bus is short', 'No, it only supports about 75 pF in Fast mode', 'Only at 5 V'], answer: 2, why: 'Rp(max) for Fast mode at 400 pF is about 885 Ω. 4.7 kΩ is far too large; it is a Standard-mode component.' },
    { q: 'Why does IPC-2221’s internal-layer width equal 2.60× the external width for the same current?', options: ['Internal copper is 2.6× thinner', 'The k constant is halved, equivalent to halving current', 'The temperature rise doubles', 'It is a measured material property'], answer: 1, why: 'With area ∝ (I/k)^(1/0.725), halving k is exactly the same as doubling the required area, a factor 2^(1/0.725).' },
    { q: 'A motor is quoted at 0.03537 N·m/A and 0.03063 N·m/A. What explains the gap?', options: ['Measurement noise', 'DC/peak vs FOC peak convention', 'Temperature only', 'A 15.47% efficiency loss'], answer: 1, why: 'The ratio is 2/√3 = 1.1547. It is a transform convention, not a loss.' },
    { q: 'At m = 0.6, how does dual-aligned unipolar ripple compare with bipolar ripple?', options: ['Equal', '0.75×', '0.375×', '2×'], answer: 2, why: 'The half-bridge model gives 0.0580 A versus 0.1540 A, a ratio of 0.375.' },
    { q: 'Using P = udid + uquq without the 1.5 factor on the Paderborn data gives what median apparent efficiency?', options: ['94.9%', '100%', '142.4%', '71%'], answer: 2, why: 'The median apparent efficiency becomes 1.4238, which is impossible. The amplitude-invariant transform requires 1.5.' },
    { q: 'What does the Paderborn torque channel independently prove about Kt?', options: ['It calibrates Kt over temperature', 'It is derived, so it is not independent evidence', 'It proves efficiency is 100%', 'It is a direct torque sensor'], answer: 1, why: 'The dataset describes torque as derived from set currents and voltages. Its temperature slope is nearly flat, consistent with a fixed model, not an independent sensor.' },
    { q: 'What makes a quantitative claim reproducible?', options: ['More decimal places', 'A named operating point, an executable model, and a stored tolerance', 'A longer abstract', 'A single successful run screenshot'], answer: 1, why: 'Reproduction needs the condition, the artifact, and the acceptance criterion. Precision alone is not evidence.' }
  ];

  function renderGuide() {
    $('#moduleList').innerHTML = MODULES.map(([num, title, body, exp]) => `<details class="module"><summary><span class="module-num">${num}</span><strong>${esc(title)}</strong></summary><div class="module-body"><p>${esc(body)}</p><p class="fine">Evidence: ${esc(exp)}</p></div></details>`).join('');
    $('#glossary').innerHTML = `<dl>${GLOSSARY.map(([term, definition]) => `<div><dt>${esc(term)}</dt><dd>${esc(definition)}</dd></div>`).join('')}</dl>`;
    renderQuiz();
  }

  let quizIndex = 0;
  let quizScore = 0;
  let quizAnswered = false;

  function renderQuiz() {
    const body = $('#quizBody');
    if (!body) return;
    if (quizIndex >= QUIZ.length) {
      const best = Math.max(quizScore, storage.get('eca-quiz-best', 0));
      storage.set('eca-quiz-best', best);
      $('#quizProgress').textContent = 'complete';
      body.innerHTML = `<div class="quiz-result"><strong>${quizScore} / ${QUIZ.length}</strong><p class="lede">${quizScore >= 8 ? 'You can spot the missing condition. Now use the three review questions on a real sentence.' : 'Read the explanations, then try again. The goal is the habit, not the score.'}</p><p class="fine">Best: ${best} / ${QUIZ.length}</p><button class="btn primary quiz-next" id="quizRestart">Restart quiz</button></div>`;
      $('#quizRestart').addEventListener('click', () => { quizIndex = 0; quizScore = 0; quizAnswered = false; renderQuiz(); });
      return;
    }
    const question = QUIZ[quizIndex];
    quizAnswered = false;
    $('#quizProgress').textContent = `${quizIndex + 1} / ${QUIZ.length}`;
    body.innerHTML = `<p class="quiz-q">${esc(question.q)}</p><div class="quiz-options">${question.options.map((option, index) => `<button class="quiz-opt" data-option="${index}">${esc(option)}</button>`).join('')}</div><p class="quiz-feedback" id="quizFeedback" aria-live="polite">Choose the answer that survives the operating point.</p><div class="quiz-next"><button class="btn primary" id="quizNext" disabled>Next question</button></div>`;
    $$('#quizBody [data-option]').forEach((button) => button.addEventListener('click', () => answerQuiz(Number(button.dataset.option))));
    $('#quizNext').addEventListener('click', () => { quizIndex += 1; renderQuiz(); });
  }

  function answerQuiz(choice) {
    if (quizAnswered) return;
    quizAnswered = true;
    const question = QUIZ[quizIndex];
    const correct = choice === question.answer;
    if (correct) quizScore += 1;
    $$('#quizBody [data-option]').forEach((button) => {
      const index = Number(button.dataset.option);
      button.disabled = true;
      if (index === question.answer) button.classList.add('correct');
      if (index === choice && !correct) button.classList.add('wrong');
    });
    const feedback = $('#quizFeedback');
    feedback.textContent = `${correct ? 'Correct.' : 'Not quite.'} ${question.why}`;
    feedback.className = `quiz-feedback ${correct ? 'good' : 'bad'}`;
    const next = $('#quizNext');
    next.disabled = false;
    next.textContent = quizIndex === QUIZ.length - 1 ? 'See result' : 'Next question';
  }

  function searchIndex() {
    return [
      ...CLAIMS.map((claim) => ({ type: 'claim', id: claim.id, label: claim.claim, sub: `${claim.experiment} · ${claim.verdict}` })),
      ...EXP.map((entry) => ({ type: 'experiment', id: entry.id, label: entry.title, sub: `Experiment ${entry.id}` })),
      ...GLOSSARY.map(([term, definition]) => ({ type: 'term', id: term, label: term, sub: definition }))
    ];
  }

  function renderSearch(query) {
    const container = $('#searchResults');
    const cleaned = query.trim().toLowerCase();
    if (!cleaned) { container.hidden = true; container.innerHTML = ''; return; }
    const matches = searchIndex().filter((item) => `${item.id} ${item.label} ${item.sub}`.toLowerCase().includes(cleaned)).slice(0, 8);
    container.innerHTML = matches.length ? matches.map((item) => `<button class="search-hit" data-search-type="${item.type}" data-search-id="${esc(item.id)}"><span class="id">${esc(item.id)}</span><span class="txt"><strong>${esc(item.label)}</strong><br>${esc(item.sub)}</span></button>`).join('') : '<div class="search-empty">No claim, experiment, or term matches that phrase.</div>';
    container.hidden = false;
  }

  function handleSearchChoice(type, id) {
    $('#searchResults').hidden = true;
    $('#globalSearch').value = '';
    if (type === 'claim') openClaim(id);
    if (type === 'experiment') openExperiment(id);
    if (type === 'term') {
      navigate('guide');
      requestAnimationFrame(() => {
        const target = $$('.glossary dt').find((dt) => dt.textContent === id);
        if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.style.color = 'var(--amber)'; setTimeout(() => { target.style.color = ''; }, 1600); }
      });
    }
  }

  function navigate(route, options = {}) {
    if (!['overview', 'claims', 'experiments', 'lab', 'game', 'guide'].includes(route)) route = 'overview';
    if (currentRoute === 'game' && route !== 'game') window.ECAGame?.unmount();
    currentRoute = route;
    $$('.page').forEach((page) => { page.hidden = page.dataset.page !== route; });
    $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.route === route));
    const labels = { overview: 'Overview', claims: 'Claims', experiments: 'Experiments', lab: 'Interactive lab', game: '3D concept game', guide: 'Field guide' };
    $('#crumb').textContent = labels[route];
    document.title = `${labels[route]} — Embedded Claims Audit`;
    if (!options.silent) history.replaceState(null, '', `#/${route}`);
    $('#sidebar').classList.remove('open');
    $('#menuBtn').setAttribute('aria-expanded', 'false');
    if (route === 'game') {
      if (window.ECAGame) window.ECAGame.mount($('#gameRoot'), { meta: M, claims: CLAIMS, results: R, store: storage });
    }
    requestAnimationFrame(() => { redrawCharts(); if (!options.keepScroll) window.scrollTo({ top: 0, behavior: 'auto' }); });
  }

  function routeFromHash() {
    return (location.hash || '#/overview').replace(/^#\/?/, '') || 'overview';
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function initTheme() {
    const saved = storage.get('eca-theme', null);
    const theme = saved || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.dataset.theme = theme;
    $('#themeBtn').addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      storage.set('eca-theme', next);
      requestAnimationFrame(redrawCharts);
    });
  }

  function bindGlobal() {
    $$('.nav-item').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.route)));
    $$('[data-go]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.go)));
    $('#menuBtn').addEventListener('click', () => {
      const open = $('#sidebar').classList.toggle('open');
      $('#menuBtn').setAttribute('aria-expanded', String(open));
    });
    $('#drawerClose').addEventListener('click', closeDrawer);
    $('#scrim').addEventListener('click', closeDrawer);
    $('#verifyInfo').addEventListener('click', () => { $('#verifyModal').hidden = false; $('#verifyModal').querySelector('button')?.focus(); });
    $('#openVerify').addEventListener('click', () => { $('#verifyModal').hidden = false; $('#verifyModal').querySelector('button')?.focus(); });
    $$('[data-close-modal]').forEach((button) => button.addEventListener('click', () => { $('#verifyModal').hidden = true; }));
    $('#verifyModal').addEventListener('click', (event) => { if (event.target.id === 'verifyModal') $('#verifyModal').hidden = true; });
    $('#experimentFilter').addEventListener('change', (event) => { claimState.experiment = event.target.value; renderClaims(); });
    $('#claimSearch').addEventListener('input', (event) => { claimState.query = event.target.value; renderClaims(); });
    $('#verdictFilter').addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      claimState.verdict = button.dataset.filter;
      renderClaims();
    });
    $('#downloadClaims').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(CLAIMS, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'embedded-claims-audit-claims.json'; link.click();
      URL.revokeObjectURL(url);
      showToast('Claim registry downloaded.');
    });
    document.addEventListener('click', (event) => {
      const claimTarget = event.target.closest('[data-claim-open]');
      const row = event.target.closest('[data-claim]');
      if (claimTarget) { openClaim(claimTarget.dataset.claimOpen); return; }
      if (row && !event.target.closest('a')) { openClaim(row.dataset.claim); return; }
      const expTarget = event.target.closest('[data-exp]');
      if (expTarget) { openExperiment(expTarget.dataset.exp); return; }
      const filterExp = event.target.closest('[data-filter-exp]');
      if (filterExp) { claimState.experiment = filterExp.dataset.filterExp; claimState.verdict = 'all'; claimState.query = ''; $('#experimentFilter').value = filterExp.dataset.filterExp; $('#claimSearch').value = ''; renderClaims(); closeDrawer(); navigate('claims'); return; }
      const copyTarget = event.target.closest('[data-copy]');
      if (copyTarget) { navigator.clipboard?.writeText(copyTarget.dataset.copy); showToast('JSON path copied.'); return; }
      const go = event.target.closest('[data-go]');
      if (go) navigate(go.dataset.go);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (!$('#verifyModal').hidden) { $('#verifyModal').hidden = true; return; }
        if ($('#drawer').classList.contains('open')) { closeDrawer(); return; }
        if (!$('#searchResults').hidden) { $('#searchResults').hidden = true; return; }
      }
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        event.preventDefault(); $('#globalSearch').focus();
      }
    });
    let searchTimer;
    $('#globalSearch').addEventListener('input', (event) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => renderSearch(event.target.value), 80); });
    $('#globalSearch').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { const first = $('#searchResults .search-hit'); if (first) first.click(); }
    });
    $('#searchResults').addEventListener('click', (event) => {
      const hit = event.target.closest('[data-search-type]');
      if (hit) handleSearchChoice(hit.dataset.searchType, hit.dataset.searchId);
    });
    document.addEventListener('click', (event) => { if (!event.target.closest('.search-wrap')) $('#searchResults').hidden = true; });
    $('#gameHelp').addEventListener('click', () => {
      showToast('Tune the drive, hit the mission target, press Apply. Six missions rebuild the audit. Sound is optional.');
    });
    window.addEventListener('resize', () => { clearTimeout(bindGlobal.resizeTimer); bindGlobal.resizeTimer = setTimeout(redrawCharts, 160); });
    window.addEventListener('hashchange', () => navigate(routeFromHash(), { silent: true }));
  }

  function init() {
    if (new URLSearchParams(location.search).get('embed') === '1') document.body.classList.add('embed');
    $('#repoLink').href = M.repo_url;
    $('#navClaims').textContent = M.claims;
    initTheme();
    fillExperimentFilter();
    renderOverview();
    renderClaims();
    renderExperiments();
    renderLab();
    renderGuide();
    bindGlobal();
    navigate(routeFromHash() || 'overview', { silent: true });
  }

  init();
})();
