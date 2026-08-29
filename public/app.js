/**
 * The only JavaScript on the site.
 *
 * Rules it lives by:
 *
 *   1. Progressive enhancement, always. Every filter control is rendered hidden
 *      and only revealed once this file runs. A visitor with JS disabled, or on
 *      a connection where this file fails, sees the complete unfiltered list
 *      rather than a dead search box.
 *   2. First party only. The CSP allows script-src 'self' and nothing else: no
 *      inline script, no CDN, no analytics. If a future feature needs a third
 *      party, that is a deliberate decision to widen the policy, not a detail.
 *   3. No dependencies, no build step. This file ships exactly as written.
 *
 * It does two things: filter a list of cards or tiles by typed text, and filter
 * by category chip. Both are convenience over content that is already on the
 * page, which is why losing them costs a visitor nothing.
 */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Normalize for comparison: lowercase, strip punctuation and accents. */
  function norm(value) {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function debounce(fn, wait) {
    var timer;
    return function () {
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(null, args); }, wait);
    };
  }

  /**
   * Wire one filter block.
   *
   * The markup contract, all data attributes so nothing depends on class names:
   *   [data-filter]          the control block, revealed by adding .is-ready
   *   [data-filter-target]   selector for the container holding the items
   *   [data-filter-item]     each filterable item, with data-search text
   *   [data-filter-count]    element that reports how many are showing
   *   [data-filter-empty]    message shown when nothing matches
   */
  function setupFilter(block) {
    var targetSelector = block.getAttribute('data-filter-target');
    var container = document.querySelector(targetSelector);
    if (!container) return;

    var items = Array.prototype.slice.call(container.querySelectorAll('[data-filter-item]'));
    if (items.length === 0) return;

    var input = block.querySelector('input[type="search"]');
    var countEl = block.querySelector('[data-filter-count]');
    var emptyEl = document.querySelector('[data-filter-empty]');
    var chips = Array.prototype.slice.call(block.querySelectorAll('[data-filter-chip]'));

    // Cache the searchable text once. Reading it per keystroke across 56 tiles
    // is wasteful, and this runs on every input event.
    var haystacks = items.map(function (item) {
      return norm(item.getAttribute('data-search') || item.textContent);
    });

    var activeChip = '';

    function apply() {
      var query = norm(input ? input.value : '');
      var terms = query ? query.split(' ') : [];
      var shown = 0;

      items.forEach(function (item, i) {
        var text = haystacks[i];
        var matchesText = terms.every(function (term) { return text.indexOf(term) !== -1; });
        var matchesChip = !activeChip || (item.getAttribute('data-category') || '') === activeChip;
        var visible = matchesText && matchesChip;

        item.hidden = !visible;
        if (visible) shown += 1;
      });

      if (countEl) {
        countEl.textContent = shown === items.length
          ? String(items.length) + ' showing'
          : String(shown) + ' of ' + items.length + ' showing';
      }
      if (emptyEl) emptyEl.hidden = shown !== 0;

      // Sections whose every child is hidden should collapse too, or the page
      // fills with empty headings.
      Array.prototype.forEach.call(container.querySelectorAll('[data-filter-group]'), function (group) {
        var any = group.querySelector('[data-filter-item]:not([hidden])');
        group.hidden = !any;
      });
    }

    if (input) {
      input.addEventListener('input', debounce(apply, 90));
      // A search input's native clear button fires 'search' in WebKit.
      input.addEventListener('search', apply);
    }

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var value = chip.getAttribute('data-filter-chip');
        activeChip = activeChip === value ? '' : value;
        chips.forEach(function (other) {
          other.setAttribute('aria-pressed', String(other.getAttribute('data-filter-chip') === activeChip));
        });
        apply();
        if (!reduceMotion && activeChip) {
          container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });

    block.classList.add('is-ready');
    apply();
  }

  /**
   * Highlight the category the reader is currently looking at.
   * Uses IntersectionObserver, and simply does nothing where it is unsupported.
   */
  function setupScrollSpy() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.cat-index a[href^="#"]'));
    if (links.length === 0 || !('IntersectionObserver' in window)) return;

    var byId = {};
    links.forEach(function (link) { byId[link.getAttribute('href').slice(1)] = link; });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = byId[entry.target.id];
        if (link) link.setAttribute('aria-current', entry.isIntersecting ? 'true' : 'false');
      });
    }, { rootMargin: '-84px 0px -60% 0px' });

    Object.keys(byId).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) observer.observe(section);
    });
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-filter]'), setupFilter);
    setupScrollSpy();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
