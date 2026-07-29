export function useChartTheme() {
  const chartColors = {
    primary: '#5D87FF',
    primaryLight: 'rgba(93, 135, 255, 0.15)',
    secondary: '#49BEFF',
    success: '#13DEB9',
    warning: '#FFAE1F',
    danger: '#FA896B',
    esbPrimary: '#FC841B',
    purple: '#8B5CF6',
    gray: '#94A3B8',
    darkText: '#2A3547',
    mutedText: '#7C8BAC',
    gridLine: '#E5EAEF',
  }

  const palette = [
    '#5D87FF',
    '#FC841B',
    '#13DEB9',
    '#FFAE1F',
    '#49BEFF',
    '#8B5CF6',
    '#FA896B',
    '#64748B',
  ]

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          color: chartColors.darkText,
          font: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: '600' },
          padding: 16,
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
      tooltip: {
        backgroundColor: '#1E293B',
        titleColor: '#FFFFFF',
        bodyColor: '#F8FAFC',
        padding: 12,
        cornerRadius: 10,
        displayColors: true,
        titleFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: 'bold' },
        bodyFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
      },
    },
  }

  return {
    chartColors,
    palette,
    commonOptions,
  }
}
