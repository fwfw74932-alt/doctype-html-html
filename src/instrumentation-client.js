// IQX platform preview guard (auto-managed). Written into your project source only when
// the project has no instrumentation-client of its own. Safe to delete or replace: if you add
// your own instrumentation-client file, IQX stops managing this one. IQX-PREVIEW-GUARD-V1
try {
  if (typeof window !== 'undefined' && !window.__iqxPreviewGuard) {
    window.__iqxPreviewGuard = true
    window.addEventListener('error', function (event) {
      try {
        var err = event && event.error
        var name = (err && err.name) || ''
        if (name !== 'SecurityError') return
        var msg = String((event && event.message) || (err && err.message) || '')
        if (msg.indexOf('$$typeof') === -1 && msg.indexOf('cross-origin frame') === -1) return
        event.preventDefault()
        event.stopImmediatePropagation()
      } catch (e) {}
    }, true)
  }
} catch (e) {}
