import * as THREE from "three";
import {
  AUDITORIUMS,
  LOBBY_PLAN,
  POS_STATIONS,
  EQUIPMENT_ANCHORS,
} from "./layout-data.js";
import { planToWorldX } from "./coordinates.js";
import { SHOWS, CONCESSION_MENU } from "./showtimes.js";
import { createVisitState, segmentHitsBox } from "./visit-state.js";

export function createInteractionTargets() {
  const target = (id, kind, label, x, y, z) => ({
    id,
    kind,
    label,
    position: new THREE.Vector3(planToWorldX(x), y, z),
  });
  const expoSection = LOBBY_PLAN.customerCounterSections.find(
    (section) =>
      section.role === "expo" || section.id === "customer-counter-expo",
  );
  const expoA = LOBBY_PLAN.customerCounter[expoSection.segmentIndex];
  const expoB = LOBBY_PLAN.customerCounter[expoSection.segmentIndex + 1];
  return [
    ...LOBBY_PLAN.kiosks.map((kiosk) =>
      target(
        kiosk.id,
        "tickets",
        "Choose a show",
        kiosk.position[0] - 0.57,
        1.2,
        kiosk.position[2],
      ),
    ),
    target(
      "box-office",
      "tickets",
      "Box office",
      ...[
        LOBBY_PLAN.boxOfficePos.position[0],
        1.68,
        LOBBY_PLAN.boxOfficePos.position[2],
      ],
    ),
    ...POS_STATIONS.map((pos) =>
      target(
        pos.id,
        "concessions",
        "Order concessions",
        pos.position[0],
        1.75,
        pos.position[2],
      ),
    ),
    target(
      "expo",
      "expo",
      "Collect at Expo",
      (expoA.x + expoB.x) / 2,
      1.4,
      (expoA.z + expoB.z) / 2,
    ),
    target(
      "ticket-check",
      "check",
      "Show your ticket",
      LOBBY_PLAN.ticketPodium.position[0],
      1.45,
      LOBBY_PLAN.ticketPodium.position[2],
    ),
    ...EQUIPMENT_ANCHORS.filter((anchor) =>
      ["soda-fountain", "icee-fountain", "drinking-fountain"].includes(
        anchor.type,
      ),
    ).map((anchor) =>
      target(
        anchor.id,
        anchor.type,
        "Fill a drink",
        anchor.position[0],
        1.45,
        anchor.position[2] - 0.6,
      ),
    ),
  ];
}

export function nearestInteraction(targets, eye, direction, colliders) {
  let best = null;
  let bestScore = Infinity;
  for (const target of targets) {
    const offset = target.position.clone().sub(eye);
    const distance = offset.length();
    if (distance > 2.65 || distance < 0.05) continue;
    const facing = offset.dot(direction) / distance;
    if (facing < 0.62) continue;
    if (colliders.some((box) => segmentHitsBox(eye, target.position, box)))
      continue;
    const score = distance + (1 - facing) * 2;
    if (score < bestScore) {
      best = target;
      bestScore = score;
    }
  }
  return best;
}

export function createVisitUI({
  controller,
  camera,
  collisionWorld,
  showToast,
  onSound,
  audio,
  crowd,
  toggleMap,
}) {
  const visit = createVisitState();
  const targets = createInteractionTargets();
  const dialog = document.querySelector("#visit-dialog");
  const prompt = document.querySelector("#interact-button");
  const status = document.querySelector("#visit-status");
  const direction = new THREE.Vector3();
  let focusedTarget = null;
  let currentView = "";
  let lastSummary = "";
  let selectedShow = SHOWS[0],
    selectedTime = selectedShow.times[0],
    selectedRow = 1,
    selectedSeat = 4;

  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const button = (text, action, className = "visit-button") => {
    const element = node("button", text, className);
    element.type = "button";
    element.addEventListener("click", action);
    return element;
  };
  const dismiss = () => dialog.close();
  function layout(title, subtitle, view) {
    currentView = view;
    const heading = node("h2", title);
    heading.id = "visit-heading";
    heading.tabIndex = -1;
    const close = button("×", dismiss, "dialog-close");
    close.setAttribute("aria-label", "Return to theater");
    const top = node("div", undefined, "dialog-heading");
    top.append(node("span", "MILILANI 14", "eyebrow"), heading, close);
    dialog.replaceChildren(top, node("p", subtitle, "dialog-subtitle"));
    const content = node("div", undefined, "dialog-content");
    dialog.append(content);
    if (!dialog.open) {
      dialog.showModal();
      controller.pause();
    }
    prompt.hidden = true;
    queueMicrotask(() => {
      if (dialog.open && !dialog.contains(document.activeElement))
        heading.focus();
    });
    return content;
  }
  dialog.addEventListener("close", () => {
    currentView = "";
    controller.resume();
  });

  function ticketWallet() {
    const body = layout(
      "Your visit",
      "Your tickets and orders stay with you during this visit.",
      "wallet",
    );
    if (visit.ticket) {
      const ticket = visit.ticket;
      const card = node("div", undefined, "admission-ticket");
      card.append(
        node(
          "span",
          ticket.checked ? "TICKET CHECKED" : "ADMIT ONE",
          "eyebrow",
        ),
        node("h3", ticket.show.title),
        node(
          "p",
          `Theater ${ticket.show.auditorium} · ${ticket.time} · Seat ${ticket.seatLabel}`,
        ),
        node(
          "small",
          ticket.checked
            ? "Enjoy your show. Use M to follow the floor plan."
            : "Take this ticket to the wooden podium at the end of the ticket hallway.",
        ),
      );
      body.append(card);
    } else
      body.append(
        node(
          "p",
          "Choose a show at one of the four entrance kiosks or at the box office.",
        ),
      );
    if (visit.order)
      body.append(
        node(
          "p",
          `Order ${visit.order.number} · ${visit.order.item.name} · ${visit.order.status === "collected" ? "Collected" : visit.order.status === "ready" ? "Ready at Expo" : "Preparing at the kitchen"}`,
        ),
      );
    if (visit.drink) body.append(node("p", `Your drink · ${visit.drink}`));
    body.append(button("Back to the theater", dismiss, "visit-button primary"));
  }

  function ticketKiosk() {
    const body = layout(
      "Choose your show",
      "Fictional shows for your simulator visit. No payment is needed.",
      "tickets",
    );
    const movieLabel = node("label", "Movie", "field-label");
    const movie = node("select");
    movie.id = "movie-select";
    for (const show of SHOWS) {
      const option = node(
        "option",
        `${show.title} · Theater ${show.auditorium}`,
      );
      option.value = show.id;
      option.selected = show === selectedShow;
      movie.append(option);
    }
    movieLabel.append(movie);
    movie.addEventListener("change", () => {
      selectedShow = SHOWS.find((show) => show.id === movie.value);
      selectedTime = selectedShow.times[0];
      selectedRow = 1;
      selectedSeat = 4;
      ticketKiosk();
      dialog.querySelector("select").focus();
    });
    body.append(
      movieLabel,
      node(
        "p",
        `${selectedShow.rating} · ${selectedShow.minutes} min`,
        "muted",
      ),
    );
    const times = node("div", undefined, "showtime-choices");
    times.setAttribute("aria-label", "Showtime");
    selectedShow.times.forEach((time) => {
      const choice = button(
        time,
        () => {
          selectedTime = time;
          ticketKiosk();
          dialog
            .querySelector('.showtime-choices [aria-pressed="true"]')
            .focus();
        },
        `visit-button ${time === selectedTime ? "selected" : ""}`,
      );
      choice.setAttribute("aria-pressed", String(time === selectedTime));
      times.append(choice);
    });
    body.append(times, node("p", "Choose a seat", "field-label"));
    const auditorium = AUDITORIUMS.find(
      (room) => room.number === selectedShow.auditorium,
    );
    const seatPlan = node("div", undefined, "seat-plan");
    seatPlan.append(node("div", "SCREEN", "seat-screen"));
    auditorium.rows.forEach((count, row) => {
      const seatRow = node("div", undefined, "seat-row");
      seatRow.append(node("span", String.fromCharCode(65 + row), "row-label"));
      for (let seat = 1; seat <= count; seat++) {
        const selected = row === selectedRow && seat === selectedSeat;
        const seatButton = button(
          String(seat),
          () => {
            selectedRow = row;
            selectedSeat = seat;
            ticketKiosk();
            dialog.querySelector('.seat-choice[aria-pressed="true"]').focus();
          },
          `seat-choice${selected ? " selected" : ""}`,
        );
        seatButton.setAttribute(
          "aria-label",
          `Row ${String.fromCharCode(65 + row)}, seat ${seat}`,
        );
        seatButton.setAttribute("aria-pressed", String(selected));
        seatRow.append(seatButton);
      }
      seatPlan.append(seatRow);
    });
    body.append(
      seatPlan,
      button(
        `${visit.ticket ? "Replace ticket" : "Get ticket"} · ${selectedTime} · ${String.fromCharCode(65 + selectedRow)}${selectedSeat}`,
        () => {
          visit.reserve(
            selectedShow.id,
            selectedTime,
            selectedRow,
            selectedSeat,
          );
          onSound("ticket");
          ticketWallet();
          showToast(
            "Ticket added to your visit. Head to the ticket podium.",
            4200,
          );
        },
        "visit-button primary",
      ),
    );
  }

  function concessions() {
    const body = layout(
      "From the kitchen",
      "Place an order here, then collect it at the white Expo counter.",
      "concessions",
    );
    if (visit.order && visit.order.status !== "collected") {
      body.append(
        node("h3", `Order ${visit.order.number}: ${visit.order.item.name}`),
        node(
          "p",
          visit.order.status === "ready"
            ? "Your order is ready at Expo."
            : "The kitchen is preparing your food.",
        ),
        button("Return to the lobby", dismiss),
      );
      return;
    }
    const menu = node("div", undefined, "food-menu");
    CONCESSION_MENU.forEach((item) => {
      const choice = button(
        "",
        () => {
          visit.placeOrder(item.id);
          onSound("ticket");
          concessions();
        },
        "food-choice",
      );
      choice.append(
        node("strong", item.name),
        node("span", item.detail),
        node("small", `${item.preparation} second preparation`),
      );
      menu.append(choice);
    });
    body.append(
      menu,
      node(
        "small",
        "All food and drink orders are part of the simulation.",
        "muted",
      ),
    );
  }

  function expo() {
    const body = layout(
      "Expo pickup",
      "Kitchen orders are collected at this counter.",
      "expo",
    );
    if (!visit.order || visit.order.status === "collected") {
      body.append(
        node(
          "p",
          visit.order
            ? "You have collected your order. Enjoy!"
            : "Order at any concession register, then return here.",
        ),
      );
      return;
    }
    body.append(
      node("h3", `Order ${visit.order.number} · ${visit.order.item.name}`),
    );
    const progress = node("p");
    progress.id = "order-progress";
    progress.setAttribute("role", "status");
    const collect = button(
      "Collect your food",
      () => {
        if (!visit.collectOrder()) return;
        onSound("pickup");
        expo();
        showToast("Order collected. Enjoy your show!", 3500);
      },
      "visit-button primary",
    );
    collect.id = "collect-order";
    body.append(progress, collect);
    updateOrderView();
  }
  function updateOrderView() {
    const progress = dialog.querySelector("#order-progress");
    if (!progress) return;
    const message =
      visit.order.status === "ready"
        ? "Ready to collect."
        : `Preparing · about ${visit.secondsRemaining()} seconds`;
    if (progress.textContent !== message) progress.textContent = message;
    dialog.querySelector("#collect-order").disabled =
      visit.order.status !== "ready";
  }

  function ticketCheck() {
    const ticket = visit.checkTicket();
    const body = layout(
      ticket ? "Enjoy your show" : "Welcome to Mililani",
      ticket
        ? "Your ticket has been checked."
        : "You can explore freely, or pick up a ticket at the entrance kiosks.",
      "check",
    );
    if (ticket) {
      const room = AUDITORIUMS.find(
        (room) => room.number === ticket.show.auditorium,
      );
      const hallDirection =
        room.entry.center < LOBBY_PLAN.ticketPodium.position[0]
          ? "right"
          : "left";
      body.append(
        node("h3", `Theater ${room.number} · ${ticket.show.title}`),
        node(
          "p",
          `Seat ${ticket.seatLabel}. Continue into the main hallway and turn ${hallDirection}. Follow the numbered auditorium signs; M opens the floor plan.`,
        ),
      );
      onSound("ticket");
    }
    body.append(button("Continue", dismiss, "visit-button primary"));
  }

  function drinks(kind) {
    const body = layout(
      "Fill your cup",
      "Choose a drink for your visit.",
      "drinks",
    );
    const flavors =
      kind === "icee-fountain"
        ? ["Cherry ICEE", "Blue raspberry ICEE"]
        : kind === "drinking-fountain"
          ? ["Water"]
          : ["Cola", "Lemon-lime", "Water"];
    flavors.forEach((flavor) =>
      body.append(
        button(flavor, () => {
          visit.pourDrink(flavor);
          onSound("pour");
          dismiss();
          showToast(`${flavor} poured.`, 2600);
        }),
      ),
    );
  }

  function settings() {
    const body = layout(
      "Make yourself comfortable",
      "Adjust the atmosphere. Your floor plan stays the same.",
      "settings",
    );
    const soundLabel = node("label", "Ambient sound", "option-row");
    const sound = node("input");
    sound.type = "checkbox";
    sound.checked = audio.enabled;
    sound.addEventListener("change", () => audio.setEnabled(sound.checked));
    soundLabel.prepend(sound);
    const volumeLabel = node("label", "Volume", "field-label");
    const volume = node("input");
    volume.type = "range";
    volume.min = "0";
    volume.max = "100";
    volume.value = String(audio.volume * 100);
    volume.setAttribute("aria-label", "Ambient sound volume");
    volume.addEventListener("input", () =>
      audio.setVolume(Number(volume.value) / 100),
    );
    volumeLabel.append(volume);
    const peopleLabel = node("label", "Staff and visitors", "option-row");
    const people = node("input");
    people.type = "checkbox";
    people.checked = crowd.enabled;
    people.addEventListener("change", () => crowd.setEnabled(people.checked));
    peopleLabel.prepend(people);
    body.append(
      soundLabel,
      volumeLabel,
      peopleLabel,
      node(
        "p",
        "WASD to move · E to interact · I for your ticket · M for the map · R to return to the entrance",
        "muted",
      ),
      button("Back to the theater", dismiss, "visit-button primary"),
    );
  }

  const interact = () => {
    if (!focusedTarget || !controller.active || dialog.open) return;
    const kind = focusedTarget.kind;
    if (kind === "tickets") ticketKiosk();
    else if (kind === "concessions") concessions();
    else if (kind === "expo") expo();
    else if (kind === "check") ticketCheck();
    else drinks(kind);
  };
  prompt.addEventListener("click", interact);
  document
    .querySelector("#ticket-button")
    .addEventListener("click", ticketWallet);
  document
    .querySelector("#settings-button")
    .addEventListener("click", settings);
  document
    .querySelector("#pause-settings-button")
    .addEventListener("click", settings);
  document
    .querySelector("#map-button")
    .addEventListener("click", () => toggleMap());
  window.addEventListener("keydown", (event) => {
    if (event.repeat || dialog.open || !controller.started) return;
    if (event.code === "KeyE") {
      event.preventDefault();
      interact();
    }
    if (event.code === "KeyI") {
      event.preventDefault();
      ticketWallet();
    }
    if (event.code === "KeyO") {
      event.preventDefault();
      settings();
    }
  });

  return {
    visit,
    targets,
    get isOpen() {
      return dialog.open;
    },
    update(delta) {
      if (
        controller.started &&
        !document.hidden &&
        (controller.active || dialog.open)
      ) {
        if (visit.update(delta)) {
          onSound("pickup");
          showToast(`Order ${visit.order.number} is ready at Expo.`, 4500);
        }
      }
      camera.getWorldDirection(direction);
      focusedTarget = controller.active
        ? nearestInteraction(
            targets,
            camera.position,
            direction,
            collisionWorld.colliders,
          )
        : null;
      prompt.hidden = !focusedTarget || dialog.open;
      if (focusedTarget)
        prompt.textContent = `${controller.isTouchMode ? "Tap" : "E"} · ${focusedTarget.label}`;
      if (currentView === "expo") updateOrderView();
      const summary = [
        visit.ticket
          ? `Theater ${visit.ticket.show.auditorium} · ${visit.ticket.seatLabel}`
          : "E · Interact at kiosks and counters",
        visit.order && visit.order.status !== "collected"
          ? `Order ${visit.order.number} ${visit.order.status === "ready" ? "ready at Expo" : "preparing"}`
          : "",
      ]
        .filter(Boolean)
        .join("  /  ");
      if (summary !== lastSummary) {
        status.textContent = summary;
        lastSummary = summary;
      }
    },
  };
}
