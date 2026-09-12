(function () {
  var style = getComputedStyle(document.documentElement);
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var ok = style.getPropertyValue('--ok').trim();
  var partial = style.getPropertyValue('--partial').trim();
  var todo = style.getPropertyValue('--todo').trim();

  var statusChart = echarts.init(document.getElementById('chart-status'), null, { renderer: 'svg' });
  statusChart.setOption({
    animation: false,
    tooltip: { trigger: 'item', appendToBody: true, formatter: function (p) { return p.name + '：' + p.value + '（' + p.percent + '%）'; } },
    legend: { bottom: 0, itemWidth: 14, itemHeight: 14, textStyle: { color: ink, fontSize: 13 } },
    series: [{
      type: 'pie',
      radius: ['46%', '72%'],
      center: ['50%', '44%'],
      itemStyle: { borderColor: bg2, borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{c}', color: ink, fontSize: 13, lineHeight: 18 },
      labelLine: { lineStyle: { color: rule } },
      data: [
        { value: 30, name: '已修复', itemStyle: { color: ok } },
        { value: 7, name: '部分修复', itemStyle: { color: partial } },
        { value: 4, name: '未修复', itemStyle: { color: todo } }
      ]
    }]
  });

  var modChart = echarts.init(document.getElementById('chart-module'), null, { renderer: 'svg' });
  modChart.setOption({
    animation: false,
    tooltip: { trigger: 'axis', appendToBody: true, axisPointer: { type: 'shadow' } },
    legend: { bottom: 0, itemWidth: 14, itemHeight: 14, textStyle: { color: ink, fontSize: 13 } },
    grid: { left: 40, right: 16, top: 30, bottom: 56 },
    xAxis: { type: 'category', data: ['后端 Rust', '前端 Vue/TS', '工程化/CI'], axisLabel: { color: muted, fontSize: 12 }, axisLine: { lineStyle: { color: rule } }, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: { color: muted, fontSize: 12 }, splitLine: { lineStyle: { color: rule } } },
    series: [
      { name: '已修复', type: 'bar', stack: 'total', barMaxWidth: 72, itemStyle: { color: ok }, data: [15, 10, 5] },
      { name: '部分修复', type: 'bar', stack: 'total', barMaxWidth: 72, itemStyle: { color: partial }, data: [1, 4, 2] },
      { name: '未修复', type: 'bar', stack: 'total', barMaxWidth: 72, itemStyle: { color: todo }, data: [1, 2, 1] }
    ]
  });

  window.addEventListener('resize', function () {
    statusChart.resize();
    modChart.resize();
  });
})();
