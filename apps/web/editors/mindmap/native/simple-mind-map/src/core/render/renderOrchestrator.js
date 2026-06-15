// 渲染代际登记：树突变推进代际，全量渲染对齐代际
// AI 提交据此判断流式期间的渲染是否已覆盖全部突变，避免重复的收尾全量渲染
export function createRenderOrchestrator(renderer) {
  renderer.renderGeneration = 0
  renderer.lastRenderedGeneration = 0

  return {
    recordFullRender() {
      renderer.lastRenderedGeneration = renderer.renderGeneration
    },
    shouldSkipCommitRender() {
      return (
        renderer.renderGeneration > 0 &&
        renderer.renderGeneration === renderer.lastRenderedGeneration
      )
    },
    noteTreeMutation() {
      renderer.renderGeneration += 1
    }
  }
}
