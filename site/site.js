// Two small interactions, no libraries, no network:
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
})()
