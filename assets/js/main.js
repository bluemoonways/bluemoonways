/* ============================================================
   Faheem Abbas — Portfolio · interactions
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Typewriter roles ---------- */
  const roles = [
    "AI Automation Specialist",
    "n8n Workflow Automation Expert",
    "AI Agents & Multi-Agent Systems",
    "API Integration Specialist",
    "Workflow Automation Engineer"
  ];
  const typedEl = document.getElementById("typed");
  if (typedEl) {
    let roleIdx = 0, charIdx = 0, deleting = false;
    (function type() {
      const word = roles[roleIdx];
      typedEl.textContent = word.slice(0, charIdx);
      let delay = deleting ? 38 : 75;
      if (!deleting && charIdx === word.length) { delay = 1800; deleting = true; }
      else if (deleting && charIdx === 0) { deleting = false; roleIdx = (roleIdx + 1) % roles.length; delay = 350; }
      else charIdx += deleting ? -1 : 1;
      setTimeout(type, delay);
    })();
  }

  /* ---------- Navbar: scroll state ---------- */
  const nav = document.getElementById("nav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 24);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile menu ---------- */
  const navToggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => {
      const open = navLinks.classList.toggle("open");
      navToggle.classList.toggle("open", open);
      navToggle.setAttribute("aria-expanded", String(open));
    });
    navLinks.querySelectorAll("a").forEach((link) =>
      link.addEventListener("click", () => {
        navLinks.classList.remove("open");
        navToggle.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      })
    );
  }

  /* ---------- Scroll reveal ---------- */
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("visible"));
  }

  /* ---------- Stat counters ---------- */
  const counters = document.querySelectorAll(".stat-num");
  if ("IntersectionObserver" in window && counters.length) {
    const co = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const target = parseInt(el.dataset.count, 10) || 0;
          const step = Math.max(1, Math.round(target / 40));
          let current = 0;
          const tick = () => {
            current = Math.min(target, current + step);
            el.textContent = String(current);
            if (current < target) requestAnimationFrame(tick);
          };
          tick();
          co.unobserve(el);
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach((el) => co.observe(el));
  } else {
    counters.forEach((el) => (el.textContent = el.dataset.count));
  }

  /* ---------- Active nav link on scroll ---------- */
  const sections = document.querySelectorAll("main section[id]");
  const linkMap = new Map();
  document.querySelectorAll(".nav-link").forEach((l) => {
    const id = l.getAttribute("href").slice(1);
    linkMap.set(id, l);
  });
  if ("IntersectionObserver" in window && sections.length) {
    const so = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            linkMap.forEach((l) => l.classList.remove("active"));
            const active = linkMap.get(entry.target.id);
            if (active) active.classList.add("active");
          }
        });
      },
      { rootMargin: "-38% 0px -55% 0px" }
    );
    sections.forEach((s) => so.observe(s));
  }

  /* ---------- Year ---------- */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
