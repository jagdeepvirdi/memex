// Small interactions, no libraries, no network:
//  0. the Theme button (auto / light / dark, remembered in this browser)
//  1. the "where does each note go?" ledger (mirrors the privacy rules the app applies before a cloud call)
//  2. copy button for the install commands
(function () {
  'use strict'

  var CLOUD = 'Gemini'

  var buttons = Array.prototype.slice.call(document.querySelectorAll('.switch .opt'))
  var items = Array.prototype.slice.call(document.querySelectorAll('#notes li'))
  var tally = document.getElementById('tally')

  function render(mode) {
    var sent = 0
    items.forEach(function (li) {
      var guard = li.getAttribute('data-guard') || ''
      var verdict = li.querySelector('.verdict')
      if (mode === 'local') {
        li.setAttribute('data-state', 'here')
        verdict.textContent = 'Stays on this computer.'
      } else if (guard) {
        li.setAttribute('data-state', 'here')
        verdict.textContent = 'Held back. ' + guard
      } else {
        li.setAttribute('data-state', 'sent')
        verdict.textContent = 'Sent to ' + CLOUD + ' to classify and search.'
        sent += 1
      }
    })
    buttons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === mode))
    })
    if (tally) {
      tally.textContent = sent === 0
        ? 'Nothing leaves your computer.'
        : sent + ' of ' + items.length + ' notes sent. ' + (items.length - sent) + ' held back.'
    }
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () { render(b.getAttribute('data-mode')) })
  })
  render('local')

  var copy = document.getElementById('copy')
  var cmds = document.getElementById('cmds')
  if (copy && cmds) {
    copy.addEventListener('click', function () {
      var text = cmds.textContent.trim()
      var done = function () {
        copy.textContent = 'Copied'
        setTimeout(function () { copy.textContent = 'Copy' }, 1800)
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { copy.textContent = 'Select and copy' })
      } else {
        copy.textContent = 'Select and copy'
      }
    })
  }

  // Theme button: auto (follow the system) -> light -> dark -> auto
  var themeBtn = document.getElementById('theme')
  if (themeBtn) {
    var order = ['auto', 'light', 'dark']
    var current = function () {
      var t = document.documentElement.getAttribute('data-theme')
      return t === 'light' || t === 'dark' ? t : 'auto'
    }
    var label = function () {
      var c = current()
      themeBtn.textContent = 'Theme: ' + c
      themeBtn.setAttribute('aria-label', 'Theme: ' + c + '. Switch to ' + order[(order.indexOf(c) + 1) % 3] + '.')
    }
    themeBtn.addEventListener('click', function () {
      var next = order[(order.indexOf(current()) + 1) % 3]
      try {
        if (next === 'auto') { document.documentElement.removeAttribute('data-theme'); localStorage.removeItem('memex-site-theme') }
        else { document.documentElement.setAttribute('data-theme', next); localStorage.setItem('memex-site-theme', next) }
      } catch (e) {}
      label()
    })
    label()
  }
})()
