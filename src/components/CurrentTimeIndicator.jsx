import React, { useState, useEffect } from 'react';
import { DayPilot } from "@daypilot/daypilot-lite-react";
import './CurrentTimeIndicator.css';

const CurrentTimeIndicator = ({ scheduler, viewMode, startDate, days, cellWidth }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [position, setPosition] = useState(null);

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date());
    };

    // Update every minute
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!scheduler || !startDate) return;

    const now = new DayPilot.Date();
    const start = new DayPilot.Date(startDate);
    
    // Check if current time is within the visible range
    const end = start.addDays(days);
    
    if (now < start || now >= end) {
      setPosition(null);
      return;
    }

    // Calculate position based on view mode
    let left = 120; // Start after row header width
    
    if (viewMode === 'day') {
      // In day view, calculate based on hours from start of the day
      const startOfDay = new DayPilot.Date(start.toString("yyyy-MM-dd") + "T00:00:00");
      const hoursSinceStart = (now.getTime() - startOfDay.getTime()) / (1000 * 60 * 60);
      left += hoursSinceStart * cellWidth;
    } else if (viewMode === 'week' || viewMode === 'month') {
      // In week/month view, calculate based on days
      const daysSinceStart = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      left += daysSinceStart * cellWidth;
    }

    setPosition({ left });
  }, [scheduler, viewMode, startDate, days, cellWidth, currentTime]);

  if (!position) return null;

  const hours = String(currentTime.getHours()).padStart(2, '0');
  const minutes = String(currentTime.getMinutes()).padStart(2, '0');
  const timeLabel = `${hours}:${minutes}`;

  // Different top position for day view vs week/month
  const labelTop = viewMode === 'day' ? '76px' : '46px';
  const lineTop = viewMode === 'day' ? '60px' : '30px'; // Start below header

  return (
    <div 
      className="current-time-indicator" 
      style={{ left: `${position.left}px` }}
    >
      <div 
        className="current-time-label"
        style={{ top: labelTop }}
      >
        {timeLabel}
      </div>
      <div 
        className="current-time-line"
        style={{ top: lineTop }}
      ></div>
    </div>
  );
};

export default CurrentTimeIndicator;
