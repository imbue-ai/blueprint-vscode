// VS Code-style scrollbar wrapper built on VscodeScrollable. Two gotchas drove
// the design: (1) VscodeScrollable's render binds `.scrollTop=${this._scrollPos}`
// which resets scroll position on Lit re-renders triggered by React slot changes,
// so we override render() to remove that binding. (2) Callers need native browser
// scrollTo (with smooth-scroll cancellation), so scrollRef exposes the inner
// .scrollable-container rather than the host element.

import { createComponent } from '@lit/react';
import { stylePropertyMap } from '@vscode-elements/elements/dist/includes/style-property-map.js';
import { VscodeScrollable } from '@vscode-elements/elements/dist/vscode-scrollable/vscode-scrollable.js';
import { css, type CSSResultGroup, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import React, { type ReactNode, useEffect, useRef } from 'react';

function flattenStyles(base: CSSResultGroup): CSSResultGroup[] {
  return Array.isArray(base) ? base.flat() : [base];
}

/* eslint-disable @typescript-eslint/no-explicit-any */

class AppScrollable extends VscodeScrollable {
  static styles = [
    ...flattenStyles(VscodeScrollable.styles),
    css`
      .scrollbar-thumb.visible {
        transition: none;
      }
      .scrollbar-track {
        background: var(--vscode-scrollbar-background, transparent);
      }
    `,
  ];

  constructor() {
    super();
    this.removeEventListener('wheel', (this as any)._handleComponentWheel);
  }

  // Override render to remove the `.scrollTop=${this._scrollPos}` binding from
  // VscodeScrollable. That binding can reset scroll position during Lit re-renders
  // (e.g. on slot changes from React updates) when _scrollPos is stale.
  render() {
    const self = this as any;
    return html`
      <div
        class="scrollable-container"
        .style=${stylePropertyMap({
          userSelect: self._isDragging ? 'none' : 'auto',
        })}
        @scroll=${self._handleScrollableContainerScroll}
      >
        <div
          class=${classMap({ shadow: true, visible: this.scrolled })}
          .style=${stylePropertyMap({
            zIndex: String(self._scrollbarTrackZ),
          })}
        ></div>
        ${self._isDragging ? html`<div class="prevent-interaction"></div>` : nothing}
        <div
          class=${classMap({
            'scrollbar-track': true,
            hidden: !self._scrollbarVisible,
          })}
          @mousedown=${self._handleScrollbarTrackPress}
        >
          <div
            class=${classMap({
              'scrollbar-thumb': true,
              visible: this.alwaysVisible ? true : self._thumbVisible,
              fade: this.alwaysVisible ? false : self._thumbFade,
              active: self._thumbActive,
            })}
            .style=${stylePropertyMap({
              height: `${self._thumbHeight}px`,
              top: `${self._thumbY}px`,
            })}
            @mousedown=${self._handleScrollThumbMouseDown}
          ></div>
        </div>
        <div class="content">
          <slot @slotchange=${self._handleSlotChange}></slot>
        </div>
      </div>
    `;
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

customElements.define('app-scrollable', AppScrollable);

const AppScrollableComponent = createComponent({
  tagName: 'app-scrollable',
  elementClass: AppScrollable,
  react: React,
  displayName: 'AppScrollable',
});

interface Props {
  children: ReactNode;
  style?: React.CSSProperties;
  scrollRef?: React.MutableRefObject<HTMLElement | null>;
}

export function ScrollPanel({ children, style, scrollRef }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null);

  useEffect(() => {
    if (!scrollRef || !ref.current) return;
    let cancelled = false;
    ref.current.updateComplete.then(() => {
      if (cancelled) return;
      const container = ref.current?.shadowRoot?.querySelector('.scrollable-container') as HTMLElement | null;
      if (container) scrollRef.current = container;
    });
    return () => {
      cancelled = true;
      if (scrollRef) scrollRef.current = null;
    };
  }, [scrollRef]);

  return (
    <AppScrollableComponent ref={ref} style={style}>
      <div style={{ paddingRight: 10 }}>{children}</div>
    </AppScrollableComponent>
  );
}
