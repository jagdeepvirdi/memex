/**
 * Converts an array of items to a CSV string.
 * Handles the nested 'structured' data by flattening it.
 */
export function itemsToCsv(items: any[]): string {
  if (items.length === 0) return ''

  // 1. Identify all unique headers including flattened structured fields
  const headers = new Set<string>(['id', 'title', 'type', 'source', 'created_at', 'categories', 'tags'])
  
  items.forEach(item => {
    if (item.structured) {
      Object.keys(item.structured).forEach(key => headers.add(`s_${key}`))
    }
  })

  const headerArray = Array.from(headers)
  
  // 2. Generate rows
  const rows = items.map(item => {
    return headerArray.map(header => {
      let val: any = ''
      
      if (header.startsWith('s_')) {
        const key = header.slice(2)
        val = item.structured?.[key]
      } else if (header === 'categories') {
        val = item.categories?.join(' > ')
      } else if (header === 'tags') {
        val = item.tags?.join(', ')
      } else {
        val = item[header]
      }

      // Format for CSV
      if (val === undefined || val === null) return '""'
      if (typeof val === 'object') val = JSON.stringify(val)
      
      const escaped = String(val).replace(/"/g, '""')
      return `"${escaped}"`
    }).join(',')
  })

  return [headerArray.join(','), ...rows].join('\n')
}

/**
 * Triggers a browser download of a CSV file.
 */
export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
