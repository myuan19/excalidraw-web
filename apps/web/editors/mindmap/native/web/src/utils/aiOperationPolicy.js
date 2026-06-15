export const AI_EDIT_SCOPE = {
  CURRENT: 'current',
  SUBTREE: 'subtree'
}

export const AI_OPERATION_ERROR_CODE = {
  PERMISSION_DENIED: 'AI_OPERATION_PERMISSION_DENIED'
}

export function normalizeAiEditScope(scope) {
  return scope === AI_EDIT_SCOPE.SUBTREE
    ? AI_EDIT_SCOPE.SUBTREE
    : AI_EDIT_SCOPE.CURRENT
}

export function createAiOperationPolicy({
  scope = AI_EDIT_SCOPE.CURRENT,
  allowCreateChildren = false,
  allowDeleteNodes = false
} = {}) {
  const editScope = normalizeAiEditScope(scope)
  const canEditChildren = editScope === AI_EDIT_SCOPE.SUBTREE
  const canCreateChildren = canEditChildren && !!allowCreateChildren
  const canDeleteChildren = canEditChildren && !!allowDeleteNodes
  const allowedOps = ['update_current', 'done']
  if (canCreateChildren) {
    allowedOps.push('add_child')
  }
  if (canEditChildren) {
    allowedOps.push('update_node')
  }
  if (canDeleteChildren) {
    allowedOps.push('delete_node')
  }
  return {
    editScope,
    canEditChildren,
    canCreateChildren,
    canDeleteChildren,
    allowInlineStyles: true,
    allowedOps
  }
}

export function buildAiOperationProtocolPrompt(policy) {
  const operationList = [
    '    <operation name="update_current">更新当前选中节点。字段：{"op":"update_current","text":{"paragraphs":[{"spans":[{"text":"整理后的标题"}]}]},"note":"","hyperlink":""}</operation>'
  ]
  const childRefOps = ['update_node']
  if (policy.canCreateChildren) {
    operationList.push(
      '    <operation name="add_child">新增子节点。字段：{"op":"add_child","id":"ai-1","parent":"current","text":{"paragraphs":[{"spans":[{"text":"子节点"}]}]}}</operation>'
    )
    childRefOps.push('add_child')
  }
  if (policy.canEditChildren) {
    operationList.push(
      '    <operation name="update_node">更新 children_summary 中列出的 child-*，或本次 add_child 创建的 ai-*。字段：{"op":"update_node","id":"child-1","text":{"paragraphs":[{"spans":[{"text":"更新后的节点"}]}]}}</operation>'
    )
  }
  if (policy.canDeleteChildren) {
    operationList.push(
      '    <operation name="delete_node">删除 children_summary 中列出的 child-*，或本次 add_child 创建的 ai-*；禁止删除 current 本身。字段：{"op":"delete_node","id":"child-1"}</operation>'
    )
    childRefOps.push('delete_node')
  }
  operationList.push(
    '    <operation name="done">所有修改完成后最后输出一行：{"op":"done"}</operation>'
  )
  const permissionRules = [
    '    <rule>只能输出 operations 中列出的 op；不要输出未列出的 op。</rule>'
  ]
  if (policy.canEditChildren) {
    permissionRules.push(
      `    <rule>当前允许操作 current 以及其子节点范围；${childRefOps.join(
        '、'
      )} 只能使用 current、children_summary 中列出的 child-*，或本次 add_child 创建的 ai-*。</rule>`
    )
  } else {
    permissionRules.push(
      '    <rule>当前只允许修改 current，不允许读取或修改子节点引用。</rule>'
    )
  }
  if (policy.canCreateChildren) {
    permissionRules.push(
      '    <rule>已开启新增子节点权限；需要新增下级内容时可以输出 add_child。add_child 的 id 必须稳定唯一，使用 ai-1、ai-2 这类临时 id。</rule>'
    )
  } else {
    permissionRules.push(
      '    <rule>未开启新增子节点权限；禁止输出 add_child。</rule>'
    )
  }
  if (policy.canDeleteChildren) {
    permissionRules.push(
      '    <rule>已开启删除节点权限；可以删除 children_summary 中列出的 child-*，或本次 add_child 创建的 ai-*；禁止删除 current 本身。</rule>'
    )
  } else {
    permissionRules.push(
      '    <rule>未开启删除节点权限；禁止输出 delete_node。</rule>'
    )
  }
  return {
    operations: operationList.join('\n'),
    permissionRules: permissionRules.join('\n'),
    childrenField: policy.canCreateChildren
      ? '    <children optional="true">仅允许通过 add_child 创建子节点。</children>'
      : '',
    addChildExample: policy.canCreateChildren
      ? '{"op":"add_child","id":"ai-1","parent":"current","text":{"paragraphs":[{"spans":[{"text":"子节点内容"}]}]}}'
      : ''
  }
}

export function createAiOperationPermissionError(operation) {
  const error = new Error(`ai operation permission denied: ${operation.op}`)
  error.code = AI_OPERATION_ERROR_CODE.PERMISSION_DENIED
  error.operation = operation
  return error
}

export function assertAiOperationAllowed(policy, operation) {
  if (!policy || !operation || operation.op === 'done') {
    return
  }
  if (!policy.allowedOps.includes(operation.op)) {
    throw createAiOperationPermissionError(operation)
  }
}
