import { random_rgba, seconds_to_hms, stringToHHMMSS } from './utils.js';

function drawChart(ctx, labels, values, options = {}) {
  if (Object.keys(options).length === 0) {
    throw new Error('Options object is empty');
  }

  var colors = [];
  var border_colors = [];
  for (var i = 0; i < labels.length; i++) {
    var color = random_rgba();
    colors.push(color);
    border_colors.push(color.replace('.5', '1'));
  }

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        // label: 'Uptime',
        data: values,
        backgroundColor: colors,
        borderColor: border_colors,
        borderWidth: 1
      }]
    },
    options: {
      tooltips: {
        callbacks: {
          label: function (toolTipItems, data) {
            return toolTipItems.yLabel + 's';
          },
          afterLabel: function (tooltipItem, data) {
            const uptime = data['datasets'][0]['data'][tooltipItem['index']]
            const uptimeFormatted = stringToHHMMSS(uptime);
            return uptimeFormatted;
          }
        }
      },
      title: { display: true, text: options.title, fontSize: 18 },
      legend: { display: false },
      scales: {
        yAxes: [{
          ticks: { beginAtZero: true, userCallback: function(v) { return seconds_to_hms(v) }},
          scaleLabel: { display: true, labelString: options.y_label, fontColor: 'blue' }

        }],
        xAxes: [{
          ticks: { autoSkip: false },
          scaleLabel: { display: false, fontColor: 'green' }
        }]
      }

    }

  });
}

$(document).ready(function () {
  const uptime_ctx = document.getElementById("chart").getContext('2d');
  const day_uptime_ctx = document.getElementById("day_chart").getContext('2d');
  const total_uptime_ctx = document.getElementById("runtime_chart").getContext('2d');

  function fetchAllData() {
    fetchUptimeData();
    fetchDayUptimeData();
    fetchTotalUptimeData();
  }

  function fetchUptimeData() {

    const uptime_options = {
      title: 'Uptime',
      y_label: 'Uptime in Seconds'
    }

    // Fetch data for uptime chart
    $.ajax({
      url: '/get_current_uptime_chart_data',
      type: 'GET',
      success: function (data) {
        drawChart(uptime_ctx, data.labels, data.values, uptime_options);
        document.getElementById('chart-spinner').style.display = 'none';
      },
      error: function (error) {
        console.error(error);
      }
    });
  }
  function fetchDayUptimeData() {
    const day_options = {
      title: 'Uptime over the last 24 hours',
      y_label: 'Uptime in Seconds'
    }

    $.ajax({
      url: '/get_day_uptime_chart_data',
      type: 'GET',
      success: function (data) {
        drawChart(day_uptime_ctx, data.labels, data.day_values, day_options);
      },
      error: function (error) {
        console.error(error);
      }
    });
  }

  function fetchTotalUptimeData() {
    const total_options = {
      title: 'Total Uptime',
      y_label: 'Uptime in Seconds'
    }
  
    $.ajax({
      url: '/get_total_uptime_chart_data',
      type: 'GET',
      success: function (data) {
        drawChart(total_uptime_ctx, data.labels, data.runtimes, total_options);
      },
      error: function (error) {
        console.error(error);
      }
    });
  }

  fetchAllData();  // Call immediately on page load

  
  const UPTIME_REFRESH_INTERVAL = 10000;  // 10 seconds
  const DAY_UPTIME_REFRESH_INTERVAL =  900000;  // 15 minutes
  const TOTAL_REFRESH_INTERVAL = 3600000;  // 1 hour

  // Fetch data at regular intervals
  setInterval(fetchUptimeData, UPTIME_REFRESH_INTERVAL);
  setInterval(fetchDayUptimeData, DAY_UPTIME_REFRESH_INTERVAL); 
  setInterval(fetchTotalUptimeData, TOTAL_REFRESH_INTERVAL); 
});