import React, { useEffect, useState, useMemo, useRef } from 'react';
import { DayPilot, DayPilotScheduler } from "@daypilot/daypilot-lite-react";
import CurrentTimeIndicator from './CurrentTimeIndicator';
import "../assets/themes/light.css";
import "../assets/toolbar.css";
import "../assets/modal.css";

const ReactScheduler = () => {
  const [scheduler, setScheduler] = useState(null);
  const [events, setEvents] = useState([]);
  const [startDate, setStartDate] = useState(DayPilot.Date.today());
  const [days, setDays] = useState(14);
  const [viewMode, setViewMode] = useState("week");
  const [scale, setScale] = useState("Day"); // "Day" | "CellDuration"
  const [cellWidth, setCellWidth] = useState(120);
  const [theme, setTheme] = useState("scheduler_light");
  const [isToday, setIsToday] = useState(true);
  
  const containerRef = useRef(null);

  // Backup ref để lưu deep copy của events (DayPilot có thể mutate trực tiếp)
  const eventsBackupRef = useRef([]);
  // Key để force re-mount DayPilotScheduler khi cần revert
  const [schedulerKey, setSchedulerKey] = useState(0);

  // State cho expanded categories
  const [expandedCategories, setExpandedCategories] = useState({
    G1: true, G2: true, G3: true, G4: true, G5: true
  });

  // Status configuration
  const statuses = [
    { name: "Đã đặt", color: "#f0c000", textColor: "#333" },
    { name: "Chưa đến", color: "#2196f3", textColor: "#fff" },
    { name: "Có khách", color: "#4caf50", textColor: "#fff" },
    { name: "Chưa đi", color: "#f44336", textColor: "#fff" },
    { name: "Đã trả", color: "#00bcd4", textColor: "#fff" },
    { name: "Bán", color: "#ff9800", textColor: "#fff" },
    { name: "Sửa", color: "#9c27b0", textColor: "#fff" }
  ];

  // Category data - source of truth
  const categoryData = [
    {
      id: "G1", name: "Studio",
      rooms: [{ name: "30.46", id: "R1" }]
    },
    {
      id: "G2", name: "Premium",
      rooms: [
        { name: "11.10*", id: "R2" },
        { name: "11.12(3ML)", id: "R3" },
        { name: "15.47", id: "R4" },
        { name: "22.18", id: "R5" },
        { name: "30.12", id: "R6" },
        { name: "30.12A", id: "R7" }
      ]
    },
    {
      id: "G3", name: "Priority",
      rooms: [
        { name: "18.01*", id: "R8" },
        { name: "32.01*", id: "R9" }
      ]
    },
    {
      id: "G4", name: "Luxury",
      rooms: [{ name: "3PN75M2", id: "R10" }]
    },
    {
      id: "G5", name: "President",
      rooms: [{ name: "3PN125m2", id: "R11" }]
    }
  ];

  // Compute flat resources based on expanded state
  const resources = useMemo(() => {
    const result = [];
    categoryData.forEach(cat => {
      const isExpanded = expandedCategories[cat.id];
      result.push({
        id: cat.id,
        name: `${isExpanded ? '▼' : '▸'} ${cat.name}`,
        isCategory: true,
        cssClass: "category-row"
      });
      if (isExpanded) {
        cat.rooms.forEach(room => {
          result.push({
            id: room.id,
            name: `    ${room.name}`,
            parentId: cat.id
          });
        });
      }
    });
    return result;
  }, [expandedCategories]);

  // Get flat room list for edit form
  const allRooms = useMemo(() => {
    return categoryData.flatMap(cat => cat.rooms);
  }, []);

  // Helper: Kiểm tra resource có phải là parent (category) không
  const isParentResource = (resourceId) => {
    const resource = resources.find(r => r.id === resourceId);
    return resource?.isCategory === true;
  };

  // Helper: Kiểm tra resourceB có phải là con của resourceA không
  const isChildOf = (childId, parentId) => {
    const child = resources.find(r => r.id === childId);
    return child?.parentId === parentId;
  };

  // Helper: Lấy parentId của một resource
  const getParentId = (resourceId) => {
    const resource = resources.find(r => r.id === resourceId);
    return resource?.parentId;
  };

  // Helper: Kiểm tra có event nào trùng thời gian trong cùng room không
  const hasOverlappingEvent = (resourceId, start, end, excludeEventId = null) => {
    const startTime = new DayPilot.Date(start);
    const endTime = new DayPilot.Date(end);

    return eventsBackupRef.current.some(ev => {
      // Bỏ qua event đang được di chuyển/resize
      if (ev.id === excludeEventId) return false;
      // Chỉ kiểm tra events trong cùng room
      if (ev.resource !== resourceId) return false;

      const evStart = new DayPilot.Date(ev.start);
      const evEnd = new DayPilot.Date(ev.end);

      // Kiểm tra overlap: 2 khoảng thời gian overlap nếu start1 < end2 VÀ start2 < end1
      return startTime < evEnd && evStart < endTime;
    });
  };

  const editEvent = async (e) => {
    const form = [
      { name: "Tên khách", id: "text" },
      { name: "Nguồn", id: "source" },
      { name: "Check-in", id: "start", type: "datetime" },
      { name: "Check-out", id: "end", type: "datetime" },
      { name: "Phòng", id: "resource", type: "select", options: allRooms },
      { name: "Trạng thái", id: "status", type: "select", options: statuses.map(s => ({ name: s.name, id: s.name })) }
    ];

    const modal = await DayPilot.Modal.form(form, e.data);
    if (modal.canceled) return;

    const status = statuses.find(s => s.name === modal.result.status);
    modal.result.backColor = status?.color || "#f0c000";
    modal.result.fontColor = status?.textColor || "#333";
    scheduler.events.update(modal.result);
  };

  const onTimeRangeSelected = async (args) => {
    const ctrl = args.control;

    // Block event creation on category rows
    if (args.resource.startsWith("G")) {
      ctrl.clearSelection();
      return;
    }

    // Kiểm tra overlap trước khi tạo event
    if (hasOverlappingEvent(args.resource, args.start, args.end)) {
      ctrl.clearSelection();
      DayPilot.Modal.alert("❌ Phòng này đã có khách trong khoảng thời gian này!");
      return;
    }

    const modal = await DayPilot.Modal.prompt("Tên khách:", "Khách mới");
    ctrl.clearSelection();
    if (modal.canceled) return;

    const newEvent = {
      start: args.start,
      end: args.end,
      id: DayPilot.guid(),
      resource: args.resource,
      text: modal.result,
      source: "Direct",
      status: "Đã đặt",
      backColor: "#f0c000",
      fontColor: "#333"
    };

    ctrl.events.add(newEvent);

    // Cập nhật backup
    const updatedEvents = [...eventsBackupRef.current, newEvent];
    eventsBackupRef.current = JSON.parse(JSON.stringify(updatedEvents));
  };

  const onBeforeEventRender = (args) => {
    const source = args.data.source || "";
    const name = args.data.text || "";
    args.data.html = `<span class="event-source">${source}</span> - ${name}`;
    args.data.borderColor = "darker";
    args.data.areas = [
      {
        right: 4,
        top: "calc(50% - 10px)",
        width: 20,
        height: 20,
        symbol: "icons/edit.svg#edit",
        borderRadius: "50%",
        backColor: "#ffffff99",
        fontColor: "#666666",
        padding: 3,
        visibility: "Hover",
        onClick: async (args) => {
          await editEvent(args.source);
        }
      }
    ];
  };

  // Xử lý trước khi render row để style category
  const onBeforeRowHeaderRender = (args) => {
    // Tô màu header cho category rows
    if (isParentResource(args.row.id)) {
      args.row.backColor = "#f5f5f5";
      args.row.fontColor = "#333";
      args.row.fontBold = true;
    }
  };

  // Count unassigned bookings for a specific date
  const getUnassignedBookingsForDate = (date) => {
    const dayStart = new DayPilot.Date(date).getDatePart();
    const dayEnd = dayStart.addDays(1);
    
    return events.filter(event => {
      const eventStart = new DayPilot.Date(event.start);
      const eventEnd = new DayPilot.Date(event.end);
      
      // Check if event has no resource (unassigned) and overlaps with this date
      return !event.resource && eventStart < dayEnd && eventEnd > dayStart;
    }).length;
  };

  // Customize time header rendering to add unassigned booking badge
  const onBeforeTimeHeaderRender = (args) => {
    // In Day view: level 0 is the day header (e.g., "Sunday 11/01")
    // In Week/Month view: level 0 is also the day header (e.g., "Sun 11")
    if (args.header.level === 0 || (viewMode === 'day' && args.header.level === 0)) {
      const count = getUnassignedBookingsForDate(args.header.start);
      if (count > 0) {
        args.header.html = `
          <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
            <span>${args.header.text}</span>
            <span class="unassigned-badge">${count}</span>
          </div>
        `;
      }
    }
  };

  // Toggle category expand/collapse
  const onRowClick = (args) => {
    const resource = args.row.data;
    if (resource.isCategory) {
      setExpandedCategories(prev => ({
        ...prev,
        [resource.id]: !prev[resource.id]
      }));
    }
  };

  const scrollToToday = () => {
    const now = new DayPilot.Date();
    
    // Always set startDate to today for date picker display
    setStartDate(now);
    setIsToday(true);
    scheduler?.scrollTo(now);
  };

  const navigatePrevious = () => {
    setIsToday(false);
    if (viewMode === "day") {
      setStartDate(startDate.addDays(-1));
    } else if (viewMode === "week") {
      setStartDate(startDate.addDays(-7));
    } else {
      setStartDate(startDate.addMonths(-1));
    }
  };

  const navigateNext = () => {
    setIsToday(false);
    if (viewMode === "day") {
      setStartDate(startDate.addDays(1));
    } else if (viewMode === "week") {
      setStartDate(startDate.addDays(7));
    } else {
      setStartDate(startDate.addMonths(1));
    }
  };

  const changeViewMode = (mode) => {
    setViewMode(mode);

    if (mode === "day") {
      setDays(1);
      setScale("CellDuration"); // Chuyển sang view theo giờ
    } else if (mode === "week") {
      setDays(30); // Load 30 ngày để cho phép scroll
      setScale("Day");
    } else {
      // Month
      const daysInMonth = startDate.daysInMonth();
      setDays(daysInMonth);
      setScale("Day");
    }
  };

  useEffect(() => {
    const today = DayPilot.Date.today();

    // Sample events (đảm bảo không trùng thời gian trong cùng room)
    const sampleEvents = [
      // Room R1 (30.46) - không trùng
      { id: 1, text: "Nguyen Thi Tuyet Mai", source: "Tera", start: today.addDays(-3), end: today.addDays(0), resource: "R1", backColor: "#f0c000", status: "Đã đặt" },
      { id: 2, text: "Nguyen Huynh Sang", source: "Tera", start: today.addDays(1), end: today.addDays(3), resource: "R1", backColor: "#f0c000", status: "Đã đặt" },
      { id: 3, text: "Vo Thi Thanh Ngoc", source: "Tera", start: today.addDays(4), end: today.addDays(7), resource: "R1", backColor: "#f0c000", status: "Đã đặt" },
      // Room R2 (11.10*) - không trùng
      { id: 4, text: "Lo Sugiarto", source: "Tera", start: today.addDays(-3), end: today.addDays(-1), resource: "R2", backColor: "#f0c000", status: "Đã đặt" },
      { id: 5, text: "Le Huynh Duc", source: "Tera", start: today.addDays(0), end: today.addDays(2), resource: "R2", backColor: "#f0c000", status: "Đã đặt" },
      { id: 6, text: "Le Uyen", source: "Tera", start: today.addDays(2), end: today.addDays(4), resource: "R2", backColor: "#f0c000", status: "Đã đặt" },
      { id: 7, text: "Huynh Tan Loc", source: "Tera", start: today.addDays(5), end: today.addDays(8), resource: "R2", backColor: "#f0c000", status: "Đã đặt" },
      // Room R3, R4
      { id: 8, text: "Mr Vuong", source: "Sellers", start: today.addDays(-3), end: today.addDays(-1), resource: "R3", backColor: "#f0c000", status: "Đã đặt" },
      { id: 9, text: "Han Van", source: "Tera", start: today.addDays(-3), end: today.addDays(-1), resource: "R4", backColor: "#f0c000", status: "Đã đặt" },
      { id: 10, text: "Le Quoc Tuan", source: "Tera", start: today.addDays(0), end: today.addDays(2), resource: "R4", backColor: "#f0c000", status: "Đã đặt" },
      { id: 11, text: "Trong Thuy - Guest", source: "Trong Thuy", start: today.addDays(2), end: today.addDays(5), resource: "R4", backColor: "#f0c000", status: "Đã đặt" },
      // Room R8, R9
      { id: 12, text: "Hen Nguyen", source: "Trip", start: today.addDays(1), end: today.addDays(5), resource: "R8", backColor: "#4caf50", status: "Có khách" },
      { id: 13, text: "Le Xu Uyen Le", source: "Trip", start: today.addDays(0), end: today.addDays(3), resource: "R9", backColor: "#f0c000", status: "Đã đặt" },
      { id: 14, text: "Nguyen Thi Tuyet Mai", source: "Tera", start: today.addDays(4), end: today.addDays(7), resource: "R9", backColor: "#4caf50", status: "Có khách" },
      
      // Unassigned bookings (chưa gán phòng) - hardcode for dates 10, 11, 12
      // Ngày 10/01 - 2 bookings
      { id: 101, text: "Booking A - Chưa gán phòng", source: "Tera", start: today, end: today.addDays(1), resource: null, backColor: "#ff9800", status: "Chưa gán" },
      { id: 102, text: "Booking B - Chưa gán phòng", source: "Trip", start: today, end: today.addDays(1), resource: null, backColor: "#ff9800", status: "Chưa gán" },
      // Ngày 11/01 - 2 bookings
      { id: 103, text: "Booking C - Chưa gán phòng", source: "Tera", start: today.addDays(1), end: today.addDays(2), resource: null, backColor: "#ff9800", status: "Chưa gán" },
      { id: 104, text: "Booking D - Chưa gán phòng", source: "Trip", start: today.addDays(1), end: today.addDays(2), resource: null, backColor: "#ff9800", status: "Chưa gán" },
      // Ngày 12/01 - 2 bookings
      { id: 105, text: "Booking E - Chưa gán phòng", source: "Tera", start: today.addDays(2), end: today.addDays(3), resource: null, backColor: "#ff9800", status: "Chưa gán" },
      { id: 106, text: "Booking F - Chưa gán phòng", source: "Trip", start: today.addDays(2), end: today.addDays(3), resource: null, backColor: "#ff9800", status: "Chưa gán" },
    ];
    setEvents(sampleEvents);
    // Tạo deep copy cho backup (DayPilot có thể mutate events state)
    eventsBackupRef.current = JSON.parse(JSON.stringify(sampleEvents));

    scheduler?.scrollTo(today);
    scheduler?.scrollTo(today);
  }, [scheduler]);

  // Handle auto-fit for week view and day view
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        // 120 is rowHeaderWidth. Subtract extra for potential vertical scrollbar logic if needed
        const availableWidth = containerWidth - 120;

        if (viewMode === "week") {
            const newCellWidth = Math.floor(availableWidth / 7);
            // Ensure not too small
            setCellWidth(Math.max(50, newCellWidth));
        } else if (viewMode === "day") {
            // Day view: 24 hours fit to screen
            const newCellWidth = Math.floor(availableWidth / 24);
             // Ensure not too small
            setCellWidth(Math.max(20, newCellWidth));
        } else if (viewMode === "month") {
             // Month view: fit all days to screen
             const newCellWidth = Math.floor(availableWidth / days);
             setCellWidth(Math.max(20, newCellWidth));
        } else {
             setCellWidth(120); 
        }
      }
    };

    handleResize(); // Initial calc
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [viewMode, days]);

  // Update current time label
  useEffect(() => {
    const updateTimeLabel = () => {
      const nowHeader = document.querySelector('.scheduler_light_now_header');
      if (nowHeader) {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        nowHeader.setAttribute('data-time', `${hours}:${minutes}`);
      }
    };

    // Update immediately
    updateTimeLabel();
    
    // Update every minute
    const interval = setInterval(updateTimeLabel, 60000);
    
    return () => clearInterval(interval);
  }, [scheduler]);

  return (
    <div className="scheduler-container" ref={containerRef}>
      {/* Status Legend */}
      <div className="status-legend">
        {statuses.map((status, index) => (
          <div key={index} className="status-item">
            <span
              className="status-dot"
              style={{ backgroundColor: status.color }}
            ></span>
            <span className="status-name">{status.name}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <button className="nav-arrow" onClick={navigatePrevious}>‹</button>
          <div className="date-picker-wrapper">
            <input
              type="date"
              id="datePicker"
              className="date-picker-hidden"
              value={startDate.toString("yyyy-MM-dd")}
              onChange={(e) => {
                if (e.target.value) {
                  const newDate = new DayPilot.Date(e.target.value);
                  setStartDate(newDate);
                  scheduler?.scrollTo(newDate);
                }
              }}
            />
            <button
              className="date-display"
              onClick={() => document.getElementById('datePicker').showPicker()}
            >
              📅 {startDate.toString("dd/MM/yyyy")}
            </button>
          </div>
          <button className="nav-arrow" onClick={navigateNext}>›</button>
        </div>

        <div className="toolbar-center">
          <div className="view-mode-group">
            <button
              className={`view-btn ${isToday ? 'active' : ''}`}
              onClick={scrollToToday}
            >
              Hôm nay
            </button>
            <button
              className={`view-btn ${viewMode === 'day' ? 'active' : ''}`}
              onClick={() => changeViewMode('day')}
            >
              Ngày
            </button>
            <button
              className={`view-btn ${viewMode === 'week' ? 'active' : ''}`}
              onClick={() => changeViewMode('week')}
            >
              Tuần
            </button>
            <button
              className={`view-btn ${viewMode === 'month' ? 'active' : ''}`}
              onClick={() => changeViewMode('month')}
            >
              Tháng
            </button>
          </div>
        </div>

        <div className="toolbar-right">
          <button className="filter-btn">Loại</button>
          <button className="filter-btn">Phòng</button>
          <label className="checkbox-label">
            <input type="checkbox" defaultChecked />
            Xem ngày
          </label>
          <div className="view-icons">
            <button className="icon-btn active">☰</button>
            <button className="icon-btn">▤</button>
            <button className="icon-btn">⊞</button>
          </div>
        </div>
      </div>

      {/* Scheduler */}
      <div className="scheduler-wrapper" style={{ position: 'relative' }}>
        <DayPilotScheduler
          key={schedulerKey}
          scale={scale}
          timeHeaders={viewMode === "day" ? [
            { groupBy: "Day", format: "dddd dd/MM" },
            { groupBy: "Hour" }
          ] : [
            { groupBy: "Day", format: "ddd dd" }
          ]}
          startDate={startDate}
          days={days}
          cellWidth={cellWidth}
          eventHeight={30}
          rowHeaderWidth={120}
          events={events}
          resources={resources}
          onBeforeEventRender={onBeforeEventRender}
          onBeforeRowHeaderRender={onBeforeRowHeaderRender}
          onBeforeTimeHeaderRender={onBeforeTimeHeaderRender}
          onTimeRangeSelected={onTimeRangeSelected}
          onRowClick={onRowClick}
          controlRef={setScheduler}
          theme={theme}
          showCurrentTime={true}
          showCurrentTimeMode="Full"
          cellDuration={60}
          eventMoveHandling={"Update"}
          eventResizeHandling={"Update"}
          onBeforeEventMove={(args) => {
            // Chặn visual indicator khi kéo vào category row
            if (isParentResource(args.newResource)) {
              args.left.enabled = false;
              args.right.enabled = false;
              return;
            }
            args.left.enabled = true;
            args.right.enabled = true;
          }}
          onEventMoving={(args) => {
            // Chặn kéo event vào category row (parent)
            if (isParentResource(args.resource)) {
              args.left.enabled = false;
              args.right.enabled = true;
              args.right.html = "Không thể kéo vào đây!";
              args.allowed = false;
              return;
            }
            // Kiểm tra overlap khi đang kéo
            if (hasOverlappingEvent(args.resource, args.start, args.end, args.e.data.id)) {
              args.left.enabled = false;
              args.right.enabled = true;
              args.right.html = "⚠️ Phòng đã có khách!";
              args.allowed = false;
            }
          }}
          heightSpec={"Parent100Pct"}
          onEventMoved={(args) => {
            const targetResource = resources.find(r => r.id === args.newResource);

            // Nếu drop vào parent row → REVERT về vị trí cũ
            if (targetResource?.isCategory) {
              console.log("❌ Dropped on parent row - reverting!");
              setEvents(JSON.parse(JSON.stringify(eventsBackupRef.current)));
              setSchedulerKey(prev => prev + 1);
              return;
            }

            // Kiểm tra overlap → REVERT nếu có trùng (không hiện thông báo)
            if (hasOverlappingEvent(args.newResource, args.newStart, args.newEnd, args.e.data.id)) {
              console.log("❌ Overlapping event - reverting!");
              setEvents(JSON.parse(JSON.stringify(eventsBackupRef.current)));
              setSchedulerKey(prev => prev + 1);
              return;
            }

            // Valid move → Cập nhật cả state VÀ backup
            console.log("✅ Valid move - updating state and backup");
            const newEvents = events.map(ev => {
              if (ev.id === args.e.data.id) {
                return {
                  ...ev,
                  start: args.newStart,
                  end: args.newEnd,
                  resource: args.newResource
                };
              }
              return ev;
            });
            setEvents(newEvents);
            // Cập nhật backup với deep copy
            eventsBackupRef.current = JSON.parse(JSON.stringify(newEvents));
          }}
          onEventResized={(args) => {
            // Kiểm tra overlap khi resize (không hiện thông báo)
            if (hasOverlappingEvent(args.e.data.resource, args.newStart, args.newEnd, args.e.data.id)) {
              console.log("❌ Overlapping after resize - reverting!");
              setEvents(JSON.parse(JSON.stringify(eventsBackupRef.current)));
              setSchedulerKey(prev => prev + 1);
              return;
            }

            console.log("✅ Valid resize - updating state and backup");
            const newEvents = events.map(ev => {
              if (ev.id === args.e.data.id) {
                return {
                  ...ev,
                  start: args.newStart,
                  end: args.newEnd
                };
              }
              return ev;
            });
            setEvents(newEvents);
            eventsBackupRef.current = JSON.parse(JSON.stringify(newEvents));
          }}
        />
        <CurrentTimeIndicator 
          scheduler={scheduler}
          viewMode={viewMode}
          startDate={startDate}
          days={days}
          cellWidth={cellWidth}
        />
      </div>
    </div>
  );
};

export default ReactScheduler;
