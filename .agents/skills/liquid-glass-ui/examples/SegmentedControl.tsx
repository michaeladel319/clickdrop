import React, { useState, useEffect, useRef } from 'react';

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  activeId: T;
  onChange: (id: T) => void;
}

export function SegmentedControl<T extends string>({
  options,
  activeId,
  onChange,
}: SegmentedControlProps<T>) {
  const itemRefs = useRef<Map<T, HTMLButtonElement>>(new Map());
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
  }, [activeId, options]);

  return (
    <div className="segmented-tab-capsule">
      {indicatorStyle && (
        <div
          className="segmented-sliding-pill"
          style={{
            left: `${indicatorStyle.left}px`,
            width: `${indicatorStyle.width}px`,
          }}
        />
      )}
      {options.map((opt) => (
        <button
          key={opt.id}
          ref={(el) => {
            if (el) itemRefs.current.set(opt.id, el);
            else itemRefs.current.delete(opt.id);
          }}
          className={`segment-btn ${opt.id === activeId ? 'active' : ''}`}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
