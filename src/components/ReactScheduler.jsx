import React, { useEffect, useState, useMemo, useRef } from 'react';
import { DayPilot, DayPilotScheduler } from "@daypilot/daypilot-lite-react";
import { Modal, Select, Tag, Space, Typography, DatePicker, ConfigProvider, Checkbox, Button, Form, Input, message, Badge, Popover, Descriptions } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import CurrentTimeIndicator from './CurrentTimeIndicator';
import "../assets/themes/light.css";
import "../assets/toolbar.css";
import "../assets/modal.css";

const ReactScheduler = () => {
  const [scheduler, setScheduler] = useState(null);
  const [events, setEvents] = useState([]);
  const [startDate, setStartDate] = useState(DayPilot.Date.today());
  const [days, setDays] = useState(7); // Week view = 7 days
  const [viewMode, setViewMode] = useState("week");
  const [scale, setScale] = useState("CellDuration"); // Week/Day view dùng CellDuration
  const [cellWidth, setCellWidth] = useState(120);
  const [theme, setTheme] = useState("scheduler_light");
  const [isToday, setIsToday] = useState(true);
  const [viewDayOnly, setViewDayOnly] = useState(false); // false = xem giờ (chi tiết), true = xem ngày (tổng quan)

  const containerRef = useRef(null);

  // Backup ref để lưu deep copy của events (DayPilot có thể mutate trực tiếp)
  const eventsBackupRef = useRef([]);
  // Key để force re-mount DayPilotScheduler khi cần revert
  const [schedulerKey, setSchedulerKey] = useState(0);

  // State cho expanded categories
  const [expandedCategories, setExpandedCategories] = useState({
    G1: true, G2: true, G3: true, G4: true, G5: true
  });

  // State cho popup gán phòng
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [unassignedForDate, setUnassignedForDate] = useState([]);

  // State cho edit event modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editForm] = Form.useForm();

  // State cho create event modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pendingEvent, setPendingEvent] = useState(null);
  const [createForm] = Form.useForm();

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
        name: cat.name,
        isCategory: true,
        isExpanded: isExpanded,
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

  // Helper: Lấy tên phòng từ ID
  const getRoomNameById = (resourceId) => {
    if (!resourceId) return null;
    const room = allRooms.find(r => r.id === resourceId);
    return room?.name || null;
  };

  // Transform events for display: snap to full days when viewDayOnly is true
  const displayEvents = useMemo(() => {
    if (!viewDayOnly) {
      return events; // Hiển thị đúng giờ thực tế
    }

    // Snap events to full days: start = 00:00 của ngày, end = 00:00 của ngày tiếp theo
    return events.map(event => {
      const startDate = new DayPilot.Date(event.start);
      const endDate = new DayPilot.Date(event.end);

      // Lấy ngày bắt đầu (00:00:00)
      const dayStart = startDate.getDatePart();

      // Lấy ngày kết thúc: 
      // - Checkout buổi chiều (> 12:00): bao gồm ngày đó (addDays(1))
      // - Checkout buổi sáng (<= 12:00): KHÔNG bao gồm ngày đó (vì khách đã đi)
      // Ví dụ: checkout 11h ngày 13 → end = ngày 13 (không thêm 1 ngày)
      //        checkout 14h ngày 13 → end = ngày 14 (để hiển thị full ngày 13)
      const endDatePart = endDate.getDatePart();
      const checkoutHour = endDate.getHours();
      const dayEnd = checkoutHour > 12 ? endDatePart.addDays(1) : endDatePart;

      return {
        ...event,
        start: dayStart,
        end: dayEnd
      };
    });
  }, [events, viewDayOnly]);

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

  // Open edit modal with Ant Design
  const openEditModal = (e) => {
    const eventData = e.data;
    setEditingEvent(eventData);
    editForm.setFieldsValue({
      text: eventData.text,
      source: eventData.source,
      start: dayjs(eventData.start.toString ? eventData.start.toString() : eventData.start),
      end: dayjs(eventData.end.toString ? eventData.end.toString() : eventData.end),
      resource: eventData.resource,
      status: eventData.status
    });
    setShowEditModal(true);
  };

  // Handle edit form submit
  const handleEditSubmit = (values) => {
    const status = statuses.find(s => s.name === values.status);
    const updatedEvent = {
      ...editingEvent,
      text: values.text,
      source: values.source,
      start: values.start.format("YYYY-MM-DDTHH:mm:ss"),
      end: values.end.format("YYYY-MM-DDTHH:mm:ss"),
      resource: values.resource,
      status: values.status,
      backColor: status?.color || "#f0c000",
      fontColor: status?.textColor || "#333"
    };

    scheduler.events.update(updatedEvent);

    // Update backup
    const newEvents = eventsBackupRef.current.map(ev =>
      ev.id === updatedEvent.id ? updatedEvent : ev
    );
    eventsBackupRef.current = JSON.parse(JSON.stringify(newEvents));
    setEvents(newEvents);

    setShowEditModal(false);
    message.success('Đã cập nhật booking!');
  };

  const onTimeRangeSelected = (args) => {
    const ctrl = args.control;

    // Block event creation on category rows
    if (args.resource.startsWith("G")) {
      ctrl.clearSelection();
      return;
    }

    // Kiểm tra overlap trước khi tạo event
    if (hasOverlappingEvent(args.resource, args.start, args.end)) {
      ctrl.clearSelection();
      message.error("❌ Phòng này đã có khách trong khoảng thời gian này!");
      return;
    }

    // Store pending event info and open create modal
    setPendingEvent({
      start: args.start,
      end: args.end,
      resource: args.resource,
      control: ctrl
    });
    createForm.setFieldsValue({ text: 'Khách mới' });
    setShowCreateModal(true);
    ctrl.clearSelection();
  };

  // Handle create form submit
  const handleCreateSubmit = (values) => {
    const newEvent = {
      start: pendingEvent.start,
      end: pendingEvent.end,
      id: DayPilot.guid(),
      resource: pendingEvent.resource,
      text: values.text,
      source: "Direct",
      status: "Đã đặt",
      backColor: "#f0c000",
      fontColor: "#333"
    };

    scheduler.events.add(newEvent);

    // Cập nhật backup
    const updatedEvents = [...eventsBackupRef.current, newEvent];
    eventsBackupRef.current = JSON.parse(JSON.stringify(updatedEvents));
    setEvents(updatedEvents);

    setShowCreateModal(false);
    message.success('Đã tạo booking mới!');
  };

  const onBeforeEventRender = (args) => {
    const source = args.data.source || "";
    const name = args.data.text || "";
    const roomName = getRoomNameById(args.data.resource) || 'Chưa gán';
    const startStr = new DayPilot.Date(args.data.start).toString('dd/MM HH:mm');
    const endStr = new DayPilot.Date(args.data.end).toString('dd/MM HH:mm');

    args.data.html = `<span class="event-source">${source}</span> - ${name}`;
    args.data.borderColor = "darker";

    // Native tooltip - mượt mà và nhẹ
    args.data.toolTip = `${name}\nNguồn: ${source}\nTrạng thái: ${args.data.status || 'N/A'}\nPhòng: ${roomName}\nCheck-in: ${startStr}\nCheck-out: ${endStr}`;

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
        onClick: (args) => {
          openEditModal(args.source);
        }
      }
    ];
  };

  // Xử lý trước khi render row để style category
  const onBeforeRowHeaderRender = (args) => {
    const resource = resources.find(r => r.id === args.row.id);

    // Tô màu header cho category rows
    if (resource?.isCategory) {
      args.row.backColor = "#f5f5f5";
      args.row.fontColor = "#333";

      // Ant Design style collapse icon (CaretRight/CaretDown)
      const isExpanded = resource.isExpanded;
      const iconSvg = isExpanded
        ? `<svg viewBox="0 0 1024 1024" width="12" height="12" fill="#1677ff" style="margin-right: 8px; transition: transform 0.2s;">
             <path d="M840.4 300H183.6c-19.7 0-30.7 20.8-18.5 35l328.4 380.8c9.4 10.9 27.5 10.9 37 0L840.4 335c12.2-14.2 1.2-35-18.5-35z"/>
           </svg>`
        : `<svg viewBox="0 0 1024 1024" width="12" height="12" fill="#1677ff" style="margin-right: 8px; transition: transform 0.2s;">
             <path d="M715.8 493.5L335 165.1c-14.2-12.2-35-1.2-35 18.5v656.8c0 19.7 20.8 30.7 35 18.5l380.8-328.4c10.9-9.4 10.9-27.6 0-37z"/>
           </svg>`;

      args.row.html = `
        <div style="display: flex; align-items: center; font-weight: 600; cursor: pointer; padding: 0 8px;">
          ${iconSvg}
          <span>${args.row.name}</span>
        </div>
      `;
    }
  };

  // Get unassigned bookings for a specific date (returns array)
  const getUnassignedBookingsForDate = (date) => {
    const dayStart = new DayPilot.Date(date).getDatePart();
    const dayEnd = dayStart.addDays(1);

    return events.filter(event => {
      const eventStart = new DayPilot.Date(event.start);
      const eventEnd = new DayPilot.Date(event.end);

      // Check if event has no resource (unassigned) and overlaps with this date
      return !event.resource && eventStart < dayEnd && eventEnd > dayStart;
    });
  };

  // Handle badge click to open assignment popup
  const handleBadgeClick = (date) => {
    const unassigned = getUnassignedBookingsForDate(date);
    setSelectedDate(date);
    setUnassignedForDate(unassigned);
    setShowAssignmentModal(true);
  };

  // Get unassigned count for current day (for toolbar badge in Day view)
  const unassignedCountForCurrentDay = useMemo(() => {
    return getUnassignedBookingsForDate(startDate).length;
  }, [events, startDate]);

  // Assign room to a booking
  const assignRoomToBooking = (bookingId, roomId) => {
    const updatedEvents = events.map(ev => {
      if (ev.id === bookingId) {
        return { ...ev, resource: roomId };
      }
      return ev;
    });
    setEvents(updatedEvents);
    eventsBackupRef.current = JSON.parse(JSON.stringify(updatedEvents));
    // Update unassigned list for current date
    const newUnassigned = unassignedForDate.filter(b => b.id !== bookingId);
    setUnassignedForDate(newUnassigned);
    if (newUnassigned.length === 0) {
      setShowAssignmentModal(false);
    }
  };

  // Customize time header rendering to add unassigned booking badge
  const onBeforeTimeHeaderRender = (args) => {
    // In Day view: level 0 is the day header (e.g., "Sunday 11/01")
    // In Week/Month view: level 0 is also the day header (e.g., "Sun 11")
    if (args.header.level === 0 || (viewMode === 'day' && args.header.level === 0)) {
      const unassigned = getUnassignedBookingsForDate(args.header.start);
      const count = unassigned.length;
      if (count > 0) {
        const headerDate = args.header.start.toString("yyyy-MM-dd");
        let badgeClass = 'unassigned-badge-week'; // default to week
        if (viewMode === 'day') badgeClass = 'unassigned-badge-day';
        if (viewMode === 'month') badgeClass = 'unassigned-badge-month';

        // Month view: badge as superscript, other views: badge positioned absolutely
        if (viewMode === 'month') {
          args.header.html = `
            <span style="position: relative;">
              ${args.header.text}<sup class="${badgeClass}" onclick="window.openAssignmentModal('${headerDate}')" style="cursor: pointer;">${count}</sup>
            </span>
          `;
        } else {
          args.header.html = `
            <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
              <span>${args.header.text}</span>
              <span class="${badgeClass}" onclick="window.openAssignmentModal('${headerDate}')" style="cursor: pointer;">${count}</span>
            </div>
          `;
        }
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
      setScale("CellDuration"); // View theo giờ
    } else if (mode === "week") {
      setDays(7); // 7 ngày
      setScale("CellDuration"); // Vẫn dùng CellDuration để có offset giờ
    } else {
      // Month - cũng dùng CellDuration để có offset giờ như EzCloud
      const daysInMonth = startDate.daysInMonth();
      setDays(daysInMonth);
      setScale("CellDuration"); // Month view cũng dùng CellDuration
    }
  };

  useEffect(() => {
    const today = DayPilot.Date.today();

    // Sample events (đảm bảo không trùng thời gian trong cùng room)
    // Check-in: 13:00, Check-out: 11:00
    const sampleEvents = [
      // Room R1 (30.46) - không trùng
      { id: 1, text: "Nguyen Thi Tuyet Mai", source: "Tera", start: today.addDays(-3).addHours(13), end: today.addDays(0).addHours(11), resource: "R1", backColor: "#f0c000", status: "Đã đặt" },
      { id: 2, text: "Nguyen Huynh Sang", source: "Tera", start: today.addDays(1).addHours(13), end: today.addDays(3).addHours(11), resource: "R1", backColor: "#f0c000", status: "Đã đặt" },
      { id: 3, text: "Vo Thi Thanh Ngoc", source: "Tera", start: today.addDays(4).addHours(13), end: today.addDays(7).addHours(11), resource: "R1", backColor: "#f0c000", status: "Đã đặt" },
      // Room R2 (11.10*) - không trùng
      { id: 4, text: "Lo Sugiarto", source: "Tera", start: today.addDays(-3).addHours(13), end: today.addDays(-1).addHours(11), resource: "R2", backColor: "#f0c000", status: "Đã đặt" },
      { id: 5, text: "Le Huynh Duc", source: "Tera", start: today.addDays(-1).addHours(13), end: today.addDays(2).addHours(11), resource: "R2", backColor: "#f0c000", status: "Đã đặt" },
      { id: 6, text: "Le Uyen", source: "Tera", start: today.addDays(2).addHours(13), end: today.addDays(4).addHours(11), resource: "R2", backColor: "#f0c000", status: "Đã đặt" },
      { id: 7, text: "Huynh Tan Loc", source: "Tera", start: today.addDays(5).addHours(13), end: today.addDays(8).addHours(11), resource: "R2", backColor: "#f0c000", status: "Đã đặt" },
      // Room R3, R4
      { id: 8, text: "Mr Vuong", source: "Sellers", start: today.addDays(-3).addHours(13), end: today.addDays(-1).addHours(11), resource: "R3", backColor: "#f0c000", status: "Đã đặt" },
      { id: 9, text: "Han Van", source: "Tera", start: today.addDays(-3).addHours(13), end: today.addDays(-1).addHours(11), resource: "R4", backColor: "#f0c000", status: "Đã đặt" },
      { id: 10, text: "Le Quoc Tuan", source: "Tera", start: today.addDays(-1).addHours(13), end: today.addDays(2).addHours(11), resource: "R4", backColor: "#f0c000", status: "Đã đặt" },
      { id: 11, text: "Trong Thuy - Guest", source: "Trong Thuy", start: today.addDays(2).addHours(13), end: today.addDays(5).addHours(11), resource: "R4", backColor: "#f0c000", status: "Đã đặt" },
      // Room R8, R9
      { id: 12, text: "Hen Nguyen", source: "Trip", start: today.addDays(1).addHours(13), end: today.addDays(5).addHours(11), resource: "R8", backColor: "#4caf50", status: "Có khách" },
      { id: 13, text: "Le Xu Uyen Le", source: "Trip", start: today.addDays(0).addHours(13), end: today.addDays(3).addHours(11), resource: "R9", backColor: "#f0c000", status: "Đã đặt" },
      { id: 14, text: "Nguyen Thi Tuyet Mai", source: "Tera", start: today.addDays(4).addHours(13), end: today.addDays(7).addHours(11), resource: "R9", backColor: "#4caf50", status: "Có khách" },

      // Unassigned bookings (chưa gán phòng)
      // Ngày 12/01 - 3 bookings
      { id: 101, text: "Booking A - Chưa gán phòng", source: "Tera", start: today.addDays(1).addHours(13), end: today.addDays(2).addHours(11), resource: null, backColor: "#ff9800", status: "Chưa gán" },
      { id: 102, text: "Booking B - Chưa gán phòng", source: "Trip", start: today.addDays(1).addHours(13), end: today.addDays(2).addHours(11), resource: null, backColor: "#ff9800", status: "Chưa gán" },
      { id: 103, text: "Booking C - Chưa gán phòng", source: "Tera", start: today.addDays(1).addHours(13), end: today.addDays(2).addHours(11), resource: null, backColor: "#ff9800", status: "Chưa gán" },
      // Ngày 13/01 - 1 booking
      { id: 104, text: "Booking D - Chưa gán phòng", source: "Trip", start: today.addDays(2).addHours(13), end: today.addDays(3).addHours(11), resource: null, backColor: "#ff9800", status: "Chưa gán" },
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
          // Week view với CellDuration: 7 ngày x 24 giờ = 168 cells
          // Mỗi ngày chiếm 1 phần 7 của màn hình, mỗi giờ thì thu nhỏ hơn
          const cellsPerDay = 24;
          const visibleDays = 7;
          const dayWidth = Math.floor(availableWidth / visibleDays);
          const newCellWidth = Math.floor(dayWidth / cellsPerDay);
          setCellWidth(Math.max(5, newCellWidth)); // Minimum 5px per hour
        } else if (viewMode === "day") {
          // Day view: 24 hours fit to screen
          const newCellWidth = Math.floor(availableWidth / 24);
          // Ensure not too small
          setCellWidth(Math.max(20, newCellWidth));
        } else if (viewMode === "month") {
          // Month view với CellDuration: days ngày x 24 giờ
          const cellsPerDay = 24;
          const dayWidth = Math.floor(availableWidth / days);
          const newCellWidth = Math.floor(dayWidth / cellsPerDay);
          setCellWidth(Math.max(2, newCellWidth)); // Minimum 2px per hour cho month
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

  // Expose function to window for badge onclick
  useEffect(() => {
    window.openAssignmentModal = (date) => {
      handleBadgeClick(date);
    };
    return () => {
      delete window.openAssignmentModal;
    };
  }, [events]);

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
          <Button type="text" onClick={navigatePrevious} style={{ fontSize: '18px', padding: '4px 8px' }}>‹</Button>
          <ConfigProvider locale={{ locale: 'vi' }}>
            <DatePicker
              value={dayjs(startDate.toString("yyyy-MM-dd"))}
              format="DD/MM/YYYY"
              onChange={(date) => {
                if (date) {
                  const newDate = new DayPilot.Date(date.format("YYYY-MM-DD"));
                  setStartDate(newDate);
                  setIsToday(false);
                  scheduler?.scrollTo(newDate);
                }
              }}
              allowClear={false}
              style={{ width: 140 }}
            />
          </ConfigProvider>
          <Button type="text" onClick={navigateNext} style={{ fontSize: '18px', padding: '4px 8px' }}>›</Button>
        </div>

        <div className="toolbar-center">
          <Space.Compact>
            <Button
              type={isToday ? 'primary' : 'default'}
              onClick={scrollToToday}
            >
              Hôm nay
            </Button>
            <Button
              type={viewMode === 'day' ? 'primary' : 'default'}
              onClick={() => changeViewMode('day')}
            >
              Ngày
            </Button>
            <Button
              type={viewMode === 'week' ? 'primary' : 'default'}
              onClick={() => changeViewMode('week')}
            >
              Tuần
            </Button>
            <Button
              type={viewMode === 'month' ? 'primary' : 'default'}
              onClick={() => changeViewMode('month')}
            >
              Tháng
            </Button>
          </Space.Compact>

          {/* Badge for Day view - shown next to view buttons */}
          {viewMode === 'day' && unassignedCountForCurrentDay > 0 && (
            <Badge
              count={unassignedCountForCurrentDay}
              style={{ marginLeft: 8, cursor: 'pointer' }}
              onClick={() => handleBadgeClick(startDate.toString("yyyy-MM-dd"))}
              title="Booking chưa gán phòng"
            />
          )}
        </div>

        <div className="toolbar-right">
          <Checkbox
            checked={viewDayOnly}
            onChange={(e) => setViewDayOnly(e.target.checked)}
          >
            Xem ngày
          </Checkbox>
        </div>
      </div>

      {/* Scheduler */}
      <div className="scheduler-wrapper" style={{ position: 'relative' }}>
        <DayPilotScheduler
          key={schedulerKey}
          scale={scale}
          timeHeaders={viewMode === "day" ? [
            { groupBy: "Day", format: "dddd dd/MM" },
            { groupBy: "Hour", format: "H" }
          ] : [
            { groupBy: "Day", format: "ddd dd" }
          ]}
          startDate={startDate}
          days={days}
          cellWidth={cellWidth}
          eventHeight={30}
          rowHeaderWidth={120}
          events={displayEvents}
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

      {/* Room Assignment Modal - Ant Design */}
      <Modal
        title={`Gán phòng - ${selectedDate ? new DayPilot.Date(selectedDate).toString("dd/MM/yyyy") : ''}`}
        open={showAssignmentModal}
        onCancel={() => setShowAssignmentModal(false)}
        footer={null}
        width={520}
        centered
      >
        {unassignedForDate.length === 0 ? (
          <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '40px 0' }}>
            Không có booking nào cần gán phòng
          </Typography.Text>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {unassignedForDate.map(booking => (
              <div
                key={booking.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: '#fafafa',
                  borderRadius: '8px',
                  border: '1px solid #f0f0f0'
                }}
              >
                <Space direction="vertical" size={2}>
                  <Typography.Text strong>{booking.text}</Typography.Text>
                  <Space size="small">
                    <Tag color="blue">{booking.source}</Tag>
                    <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                      {new DayPilot.Date(booking.start).toString("dd/MM")} - {new DayPilot.Date(booking.end).toString("dd/MM")}
                    </Typography.Text>
                  </Space>
                </Space>
                <Select
                  placeholder="Chọn phòng..."
                  style={{ width: 150 }}
                  onChange={(value) => assignRoomToBooking(booking.id, value)}
                  options={categoryData.map(cat => ({
                    label: cat.name,
                    options: cat.rooms.map(room => ({
                      label: room.name,
                      value: room.id
                    }))
                  }))}
                />
              </div>
            ))}
          </Space>
        )}
      </Modal>

      {/* Edit Event Modal */}
      <Modal
        title="Chỉnh sửa booking"
        open={showEditModal}
        onCancel={() => setShowEditModal(false)}
        footer={null}
        width={480}
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleEditSubmit}
        >
          <Form.Item name="text" label="Tên khách" rules={[{ required: true, message: 'Vui lòng nhập tên khách' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="source" label="Nguồn">
            <Input />
          </Form.Item>
          <Space style={{ width: '100%' }} size="middle">
            <Form.Item name="start" label="Check-in" style={{ flex: 1 }}>
              <DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="end" label="Check-out" style={{ flex: 1 }}>
              <DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="resource" label="Phòng">
            <Select
              options={categoryData.map(cat => ({
                label: cat.name,
                options: cat.rooms.map(room => ({
                  label: room.name,
                  value: room.id
                }))
              }))}
            />
          </Form.Item>
          <Form.Item name="status" label="Trạng thái">
            <Select
              options={statuses.map(s => ({ label: s.name, value: s.name }))}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setShowEditModal(false)}>Hủy</Button>
              <Button type="primary" htmlType="submit">Lưu</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Create Event Modal */}
      <Modal
        title="Tạo booking mới"
        open={showCreateModal}
        onCancel={() => setShowCreateModal(false)}
        footer={null}
        width={400}
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateSubmit}
        >
          <Form.Item name="text" label="Tên khách" rules={[{ required: true, message: 'Vui lòng nhập tên khách' }]}>
            <Input placeholder="Nhập tên khách..." />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setShowCreateModal(false)}>Hủy</Button>
              <Button type="primary" htmlType="submit">Tạo booking</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ReactScheduler;
