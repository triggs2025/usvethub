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

  /**
   * Site search, over a static index fetched once.
   *
   * No search service and no third-party script, so nothing anyone types here
   * leaves the browser. On a benefits site the query itself is sensitive: a
   * person searching "100 percent disabled property tax" has told you a great
   * deal about themselves, and the safest place for that is nowhere.
   *
   * The index loads on first interaction rather than on page load, so arriving
   * at the page costs nothing extra. Until it loads, and if it fails to, the
   * browse links below stay visible, which is the whole content of the page
   * reachable without search at all.
   */
  function setupSearch() {
    var root = document.querySelector('[data-search-page]');
    if (!root) return;

    var input = root.querySelector('[data-search-input]');
    var status = root.querySelector('[data-search-status]');
    var list = root.querySelector('[data-search-results]');
    var fallback = document.querySelector('[data-search-fallback]');
    var index = null;
    var loading = false;
    var MAX = 40;

    root.hidden = false;

    function load() {
      if (index || loading) return Promise.resolve();
      loading = true;
      status.textContent = 'Loading the index...';
      return fetch(base() + '/search-index.json', { credentials: 'omit' })
        .then(function (r) {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        })
        .then(function (data) {
          index = data;
          loading = false;
          status.textContent = '';
        })
        .catch(function () {
          loading = false;
          status.textContent = 'Search could not load. The browse links below still work.';
        });
    }

    /**
     * The deploy base, recovered from the stylesheet href.
     *
     * The site builds both to a domain root and to a github.io subpath, and a
     * root-relative fetch silently 404s on the subpath build. Reading it off an
     * asset the page already loaded avoids inventing a second source of truth.
     */
    function base() {
      var link = document.querySelector('link[rel="stylesheet"]');
      var href = link ? link.getAttribute('href') || '' : '';
      return href.replace(/\/styles\.[0-9a-f]{8}\.css$/, '');
    }

    function render(query) {
      var terms = norm(query).split(' ').filter(Boolean);
      list.innerHTML = '';

      if (terms.length === 0) {
        status.textContent = '';
        if (fallback) fallback.hidden = false;
        return;
      }
      if (!index) return;

      var hits = [];
      for (var i = 0; i < index.length && hits.length < MAX * 4; i++) {
        var entry = index[i];
        var matched = true;
        for (var t = 0; t < terms.length; t++) {
          if (entry.s.indexOf(terms[t]) === -1) { matched = false; break; }
        }
        // A term appearing in the title is a better hit than one buried in a
        // summary, so rank on that rather than on index order.
        if (matched) hits.push({ e: entry, score: norm(entry.t).indexOf(terms[0]) === 0 ? 0 : 1 });
      }
      hits.sort(function (a, b) { return a.score - b.score; });

      var frag = document.createDocumentFragment();
      hits.slice(0, MAX).forEach(function (hit) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = base() + hit.e.u;
        var strong = document.createElement('strong');
        strong.textContent = hit.e.t;
        var meta = document.createElement('small');
        meta.textContent = hit.e.k + (hit.e.c ? ' · ' + hit.e.c : '');
        a.appendChild(strong);
        a.appendChild(meta);
        li.appendChild(a);
        frag.appendChild(li);
      });
      list.appendChild(frag);

      if (hits.length === 0) {
        status.textContent = 'Nothing matches that yet. Try a broader word, or browse below.';
        if (fallback) fallback.hidden = false;
      } else {
        status.textContent = hits.length > MAX
          ? 'Showing the first ' + MAX + ' of ' + hits.length + ' matches'
          : hits.length + (hits.length === 1 ? ' match' : ' matches');
        if (fallback) fallback.hidden = true;
      }
    }

    var run = debounce(function () { render(input.value); }, 90);

    input.addEventListener('focus', load, { once: true });
    input.addEventListener('input', function () {
      load().then(function () { render(input.value); });
      run();
    });
    input.addEventListener('search', function () { render(input.value); });
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-filter]'), setupFilter);
    setupScrollSpy();
    setupSearch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
