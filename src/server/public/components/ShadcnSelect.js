/**
 * shadcn/ui Custom Select Component
 * Replaces native <select> elements with an authentic, accessible shadcn/ui Select:
 * - Trigger button with selected label and animated rotating chevron
 * - Floating glassmorphic popover with subtle border and shadow
 * - Interactive items with hover states and active checkmark icons
 * - Native event syncing (dispatches standard 'change' events)
 */

export function enhanceSelect(selectEl) {
  if (!selectEl || selectEl.dataset.shadcnEnhanced === 'true') {
    return;
  }

  // Mark as enhanced
  selectEl.dataset.shadcnEnhanced = 'true';
  selectEl.classList.add('shadcn-native-hidden');

  // Wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'shadcn-select-container';
  if (selectEl.className) {
    // Preserve custom sizing classes if any
    if (selectEl.classList.contains('form-control-sm')) wrapper.classList.add('shadcn-select-sm');
  }

  // Insert wrapper before select and move select inside
  selectEl.parentNode.insertBefore(wrapper, selectEl);
  wrapper.appendChild(selectEl);

  // Trigger Button
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'shadcn-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const valueSpan = document.createElement('span');
  valueSpan.className = 'shadcn-select-value';

  const chevronSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevronSvg.setAttribute('class', 'shadcn-select-chevron');
  chevronSvg.setAttribute('width', '16');
  chevronSvg.setAttribute('height', '16');
  chevronSvg.setAttribute('viewBox', '0 0 24 24');
  chevronSvg.setAttribute('fill', 'none');
  chevronSvg.setAttribute('stroke', 'currentColor');
  chevronSvg.setAttribute('stroke-width', '2');
  chevronSvg.setAttribute('stroke-linecap', 'round');
  chevronSvg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'm6 9 6 6 6-6');
  chevronSvg.appendChild(path);

  trigger.appendChild(valueSpan);
  trigger.appendChild(chevronSvg);
  wrapper.appendChild(trigger);

  // Popover list container
  const popover = document.createElement('div');
  popover.className = 'shadcn-select-popover hidden';
  popover.setAttribute('role', 'listbox');

  const viewport = document.createElement('div');
  viewport.className = 'shadcn-select-viewport';
  popover.appendChild(viewport);
  wrapper.appendChild(popover);

  function rebuildItems() {
    viewport.innerHTML = '';
    const options = Array.from(selectEl.options);

    options.forEach((opt) => {
      const item = document.createElement('div');
      item.className = 'shadcn-select-item';
      item.setAttribute('role', 'option');
      item.dataset.value = opt.value;

      const isSelected = opt.value === selectEl.value;
      if (isSelected) item.classList.add('selected');

      // Checkmark icon
      const checkIcon = document.createElement('span');
      checkIcon.className = 'shadcn-select-check';
      checkIcon.innerHTML = isSelected
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
        : '';

      const textSpan = document.createElement('span');
      textSpan.className = 'shadcn-select-item-text';
      textSpan.textContent = opt.textContent;

      item.appendChild(checkIcon);
      item.appendChild(textSpan);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        selectOption(opt.value);
        closePopover();
      });

      viewport.appendChild(item);
    });

    updateTriggerLabel();
  }

  function updateTriggerLabel() {
    const selectedOpt = selectEl.options[selectEl.selectedIndex];
    valueSpan.textContent = selectedOpt ? selectedOpt.textContent : (selectEl.placeholder || 'Select...');
    
    // Update active classes on items
    viewport.querySelectorAll('.shadcn-select-item').forEach((item) => {
      const isSelected = item.dataset.value === selectEl.value;
      item.classList.toggle('selected', isSelected);
      const check = item.querySelector('.shadcn-select-check');
      if (check) {
        check.innerHTML = isSelected
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
          : '';
      }
    });
  }

  function selectOption(val) {
    if (selectEl.value !== val) {
      selectEl.value = val;
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    updateTriggerLabel();
  }

  function openPopover() {
    // Close any other open popovers
    document.querySelectorAll('.shadcn-select-popover:not(.hidden)').forEach((p) => {
      if (p !== popover) p.classList.add('hidden');
    });
    document.querySelectorAll('.shadcn-select-trigger[aria-expanded="true"]').forEach((t) => {
      if (t !== trigger) t.setAttribute('aria-expanded', 'false');
    });

    rebuildItems();
    popover.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    wrapper.classList.add('open');

    // Scroll selected into view
    const selectedEl = viewport.querySelector('.shadcn-select-item.selected');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function closePopover() {
    popover.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
    wrapper.classList.remove('open');
  }

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = trigger.getAttribute('aria-expanded') === 'true';
    if (isOpen) {
      closePopover();
    } else {
      openPopover();
    }
  });

  // Listen to programmatic changes on original select
  selectEl.addEventListener('change', () => {
    updateTriggerLabel();
  });

  // Attach helper to element
  selectEl._shadcnSync = () => {
    rebuildItems();
  };

  rebuildItems();
}

/**
 * Enhances all select elements in a given root container
 */
export function enhanceAllSelects(root = document) {
  const selects = root.querySelectorAll('select:not([data-shadcn-enhanced="true"])');
  selects.forEach((s) => enhanceSelect(s));
}

/**
 * Global document listener to close open popovers on click outside
 */
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.shadcn-select-container')) {
      document.querySelectorAll('.shadcn-select-popover:not(.hidden)').forEach((p) => {
        p.classList.add('hidden');
      });
      document.querySelectorAll('.shadcn-select-trigger[aria-expanded="true"]').forEach((t) => {
        t.setAttribute('aria-expanded', 'false');
      });
      document.querySelectorAll('.shadcn-select-container.open').forEach((w) => {
        w.classList.remove('open');
      });
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.shadcn-select-popover:not(.hidden)').forEach((p) => {
        p.classList.add('hidden');
      });
      document.querySelectorAll('.shadcn-select-trigger[aria-expanded="true"]').forEach((t) => {
        t.setAttribute('aria-expanded', 'false');
      });
      document.querySelectorAll('.shadcn-select-container.open').forEach((w) => {
        w.classList.remove('open');
      });
    }
  });
}

