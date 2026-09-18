import React, { useState, useEffect, useRef } from 'react';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  hasPulse?: boolean;
}

interface LiquidNavProps {
  items: NavItem[];
  activeId: string;
  onChange: (id: string) => void;
}

export const LiquidNav: React.FC<LiquidNavProps> = ({ items, activeId, onChange }) => {
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const updateIndicator = () => {
      const activeEl = itemRefs.current.get(activeId);
      if (activeEl) {
        setIndicatorStyle({
          left: activeEl.offsetLeft,
          width: activeEl.offsetWidth,
        });
      }
    };

    updateIndicator();
    const t = setTimeout(updateIndicator, 40);
    window.addEventListener('resize', updateIndicator);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', updateIndicator);
    };
  }, [activeId, items]);

  return (
    <nav className="liquid-glass-nav" aria-label="Main Navigation">
      <div className="liquid-nav-track">
        {indicatorStyle && (
          <div
            className="liquid-sliding-indicator"
            style={{
              left: `${indicatorStyle.left}px`,
              width: `${indicatorStyle.width}px`,
            }}
          />
        )}

        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              ref={(el) => {
                if (el) itemRefs.current.set(item.id, el);
                else itemRefs.current.delete(item.id);
              }}
              className={`liquid-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onChange(item.id)}
              aria-label={item.label}
            >
              <span className="liquid-icon-wrap">
                {item.icon}
                {item.hasPulse && <span className="liquid-pulse-dot" />}
              </span>
              <span className="liquid-nav-text">{item.label}</span>
              {typeof item.badge === 'number' && (
                <span className={`liquid-count-badge ${isActive ? 'badge-active' : ''}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
