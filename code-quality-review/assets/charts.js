(function () {
  var style = getComputedStyle(document.documentElement);
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg = style.getPropertyValue('--bg').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var sevHigh = style.getPropertyValue('--sev-high').trim();
  var sevMid = style.getPropertyValue('--sev-mid').trim();
  var sevLow = style.getPropertyValue('--sev-low').trim();

  // --- Chart 1: severity distribution (donut) ---
  var sevChart = echarts.init(document.getElementById('chart-severity'), null, { renderer: 'svg' });
  sevChart.setOption({
    animation: false,
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      formatter: function (p) { return p.name + '：' + p.value + '（' + p.percent + '%）'; }
    },
    legend: {
      bottom: 0,
      itemWidth: 14,
      itemHeight: 14,
      textStyle: { color: ink, fontSize: 13 }
    },
    series: [{
      type: 'pie',
      radius: ['46%', '72%'],
      center: ['50%', '44%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: bg2, borderWidth: 2 },
      label: {
        show: true,
        formatter: '{b}\n{c}',
        color: ink,
        fontSize: 13,
        lineHeight: 18
      },
      labelLine: { lineStyle: { color: rule } },
      data: [
        { value: 3, name: '高危', itemStyle: { color: sevHigh } },
        { value: 18, name: '中危', itemStyle: { color: sevMid } },
        { value: 20, name: '低危', itemStyle: { color: sevLow } }
      ]
    }]
  });

  // --- Chart 2: findings by module x severity (stacked bar) ---
  var modChart = echarts.init(document.getElementById('chart-module'), null, { renderer: 'svg' });
  modChart.setOption({
    animation: false,
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      axisPointer: { type: 'shadow' }
    },
    legend: {
      bottom: 0,
      itemWidth: 14,
      itemHeight: 14,
      textStyle: { color: ink, fontSize: 13 }
    },
    grid: { left: 40, right: 16, top: 30, bottom: 56 },
    xAxis: {
      type: 'category',
      data: ['后端 Rust', '前端 Vue/TS', '工程化/CI'],
      axisLabel: { color: muted, fontSize: 12 },
      axisLine: { lineStyle: { color: rule } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: muted, fontSize: 12 },
      splitLine: { lineStyle: { color: rule } }
    },
    series: [
      { name: '高危', type: 'bar', stack: 'total', barMaxWidth: 72, itemStyle: { color: sevHigh }, data: [2, 1, 0] },
      { name: '中危', type: 'bar', stack: 'total', barMaxWidth: 72, itemStyle: { color: sevMid }, data: [6, 7, 5] },
      { name: '低危', type: 'bar', stack: 'total', barMaxWidth: 72, itemStyle: { color: sevLow }, data: [9, 7, 4] }
    ]
  });

  window.addEventListener('resize', function () {
    sevChart.resize();
    modChart.resize();
  });
})();
