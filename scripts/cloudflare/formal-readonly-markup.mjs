import ts from 'typescript'

// Applied only to the generated formal read-only copy, never to the editors.
// Server-side authorization remains the security boundary.
export function freezeFormalEditor(source, file = 'editor.tsx', managed = false) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits = []
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(ast)
      const attrs = node.attributes.properties
      const get = name => attrs.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(ast) === name)
      const value = name => get(name)?.initializer?.getText(ast) || ''
      const additions = []
      const force = (name, expression) => {
        const existing = get(name)
        if (existing) edits.push([existing.getStart(ast), existing.end, `${name}=${expression}`])
        else additions.push(`${name}=${expression}`)
      }
      const handler = value('onClick')
      const gate = /[Uu]pload/.test(handler) || /file/.test(value('type')) ? 'formalCanUpload()' : 'formalCanWrite()'
      const block = name => {
        const original = get(name)?.initializer
        const expression = original && ts.isJsxExpression(original) ? original.expression?.getText(ast) : original?.getText(ast) || (get(name) ? 'true' : '')
        force(name, managed ? `{!${gate}${expression ? ` || (${expression})` : ''}}` : '{true}')
      }
      const inputHandler = value('onChange') + value('onValueChange')
      const filter = /\bset(?:SearchQuery|SortOption|FilterRegion|FocusFilter|FilterCountry)\b/.test(inputHandler)
      let viewLink = false
      let parent = node.parent
      for (let i = 0; parent && i < 4; i++, parent = parent.parent) {
        if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText(ast) === 'Link') {
          viewLink = /\/admin\/(?:edit|guide-preview)/.test(parent.openingElement.attributes.getText(ast))
          if (viewLink) break
        }
      }
      if (/^(?:input|Input|textarea|Textarea)$/.test(tag) && !filter) {
        if (/checkbox|radio|file/.test(value('type'))) block('disabled')
        else block('readOnly')
      }
      if (/^(?:select|Select|Checkbox)$/.test(tag) && !filter) block('disabled')
      if (/^(?:button|Button|AlertDialogAction)$/.test(tag)) {
        const viewing = /\b(?:setCurrentPage|hydrateNote|selectGuide|setEditingLanguage|openPreviewFromEditor|returnToEditorPosition|setShowQuickToc|jumpToMarkdownHeading|setActiveDayEditor)\b/.test(handler) ||
          /router\.push\(['"]\/admin['"]\)/.test(handler)
        if (managed && /deleteCurrentNote|deleteGuide|handleDelete/.test(handler)) force('disabled', '{true}')
        else if (/submit/.test(value('type')) || (!viewing && !viewLink)) block('disabled')
        if (viewLink) { force('aria-label', '"查看资料"'); force('title', '"查看资料（只读）"') }
      }
      if (tag === 'Link' && /['"]\/admin\/add['"]/.test(value('href'))) {
        force('aria-disabled', managed ? '{!formalCanWrite()}' : '{true}'); force('tabIndex', managed ? '{formalCanWrite() ? 0 : -1}' : '{-1}')
        force('onClick', managed ? '{(event) => { if (!formalCanWrite()) event.preventDefault() }}' : '{(event) => event.preventDefault()}')
      }
      if (get('contentEditable')) force('contentEditable', managed ? `{formalCanWrite() && (${value('contentEditable').replace(/^\{|\}$/g, '') || 'true'})}` : '{false}')
      if (get('draggable')) force('draggable', managed ? `{formalCanWrite() && (${value('draggable').replace(/^\{|\}$/g, '') || 'true'})}` : '{false}')
      if (additions.length) edits.push([node.attributes.end, node.attributes.end, ' ' + additions.join(' ')])
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) {
    source = source.slice(0, start) + replacement + source.slice(end)
  }
  if (managed) source = source.replace(/(['"]use client['"]\s*;?)/, '$1\nimport { formalCanWrite, formalCanUpload } from "@/lib/formal-browser-capabilities"\n')
  return source
}
