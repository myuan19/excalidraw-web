import { fromMarkdown } from 'mdast-util-from-markdown'
import { looksLikeMarkdown } from '../plugins/markdown/markdownPaste'

const getNodeText = node => {
  if (node.type === 'list') return ''
  let textStr = ''

  ;(node.children || []).forEach(item => {
    if (['inlineCode', 'text'].includes(item.type)) {
      textStr += item.value || ''
    } else {
      textStr += getNodeText(item)
    }
  })

  return textStr
}

const getNodeRawMarkdown = (node, sourceText) => {
  if (node.position && sourceText) {
    const start = node.position.start.offset
    const end = node.position.end.offset
    return sourceText.slice(start, end)
  }
  return null
}

const handleList = (node, sourceText) => {
  let list = []
  let walk = (arr, newArr) => {
    for (let i = 0; i < arr.length; i++) {
      let cur = arr[i]
      let newNode = {}
      const text = getNodeText(cur)
      newNode.data = { text }
      const rawMd = getNodeRawMarkdown(cur, sourceText)
      if (rawMd && looksLikeMarkdown(rawMd)) {
        newNode.data.markdown = rawMd
      }
      newNode.children = []
      newArr.push(newNode)
      if (cur.children.length > 1) {
        for (let j = 1; j < cur.children.length; j++) {
          let cur2 = cur.children[j]
          if (cur2.type === 'list') {
            walk(cur2.children, newNode.children)
          }
        }
      }
    }
  }
  walk(node.children, list)
  return list
}

export const transformMarkdownTo = md => {
  const tree = fromMarkdown(md)
  let root = {
    children: []
  }
  let childrenQueue = [root.children]
  let currentChildren = root.children
  let depthQueue = [-1]
  let currentDepth = -1
  for (let i = 0; i < tree.children.length; i++) {
    let cur = tree.children[i]
    if (cur.type === 'heading') {
      if (!cur.children[0]) continue
      let node = {}
      const text = getNodeText(cur)
      node.data = { text }
      const rawMd = getNodeRawMarkdown(cur, md)
      if (rawMd && looksLikeMarkdown(rawMd)) {
        node.data.markdown = rawMd
      }
      node.children = []
      if (cur.depth > currentDepth) {
        currentChildren.push(node)
        childrenQueue.push(node.children)
        currentChildren = node.children
        depthQueue.push(cur.depth)
        currentDepth = cur.depth
      } else if (cur.depth === currentDepth) {
        childrenQueue.pop()
        currentChildren = childrenQueue[childrenQueue.length - 1]
        depthQueue.pop()
        currentDepth = depthQueue[depthQueue.length - 1]
        currentChildren.push(node)
        childrenQueue.push(node.children)
        currentChildren = node.children
        depthQueue.push(cur.depth)
        currentDepth = cur.depth
      } else {
        while (depthQueue.length) {
          childrenQueue.pop()
          currentChildren = childrenQueue[childrenQueue.length - 1]
          depthQueue.pop()
          currentDepth = depthQueue[depthQueue.length - 1]
          if (currentDepth < cur.depth) {
            currentChildren.push(node)
            childrenQueue.push(node.children)
            currentChildren = node.children
            depthQueue.push(cur.depth)
            currentDepth = cur.depth
            break
          }
        }
      }
    } else if (cur.type === 'list') {
      currentChildren.push(...handleList(cur, md))
    }
  }
  return root.children[0]
}
