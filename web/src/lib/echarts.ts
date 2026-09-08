// ECharts 按需注册
import * as echarts from 'echarts/core'
import { BarChart, GaugeChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LineChart,
  BarChart,
  GaugeChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
])

export default echarts
export type ChartInstance = ReturnType<typeof echarts.init>
export type ChartOption = echarts.EChartsCoreOption
