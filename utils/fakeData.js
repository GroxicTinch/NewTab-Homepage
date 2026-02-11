function createFakeAccountSignInButtons(container) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = getFakeSignInButtonHTML();

  // Optional: Attach event handler here (instead of inline in HTML)
  const button = wrapper.querySelector("button");
  if (button) {
    button.addEventListener("click", () => {
      if (userConfirmation !== null) {
        userConfirmation("In Demo Mode this button does not perform a real sign-in. It is only for visual purposes.");
      }
    });
  }

  container.appendChild(wrapper);
}

function getFakeSignInButtonHTML() {
  return `
      <button class="m-auto flex items-center justify-center bg-[#4285F4] text-white rounded shadow gap-3 hover:bg-[#357ae8] transition">
        <div class="gsi-material-button-content-wrapper bg-white p-2 rounded">
          <div class="w-6">
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" xmlns:xlink="http://www.w3.org/1999/xlink" style="display: block;">
              <path fill="#ea3599" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
              <path fill="#f442b0" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
              <path fill="#05fb32" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
              <path fill="#a88334" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              <path fill="none" d="M0 0h48v48H0z"></path>
            </svg>
          </div>
        </div>
        <span class="text-sm font-medium pl-1 pr-4">Don't Sign in with Google</span>
      </button>
    `;
}

// Fake data generators for static page mode
function generateFakeEmails() {
  const senders = [
    { name: 'John Smith', email: 'john.smith@example.com' },
    { name: 'Sarah Johnson', email: 'sarah.j@example.com' },
    { name: 'Team Lead', email: 'team.lead@company.com' },
    { name: 'HR Department', email: 'hr@company.com' },
    { name: 'Marketing', email: 'marketing@company.com' }
  ];
  const subjects = [
    'Did you see the new homepage design?',
    'This homepage is amazing! you should totally check it out',
    'Drop everything! Check out this new tab page!',
    'We have noticed a boost in morale, raises for all!',
    'Wait? Surely it isn\'t free?'
  ];
  
  const now = new Date();
  const messages = [];
  for (let i = 0; i < 5; i++) {
    const sender = senders[i % senders.length];
    const subject = subjects[i % subjects.length];
    const date = new Date(now.getTime() - (i * 3600000)); // Each email is 1 hour older
    
    messages.push({
      id: `fake_${i}`,
      from: sender.name,
      email: sender.email,
      subject: subject,
      date: date
    });
  }
  return messages;
}

function generateFakeTasks() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);
  const nextWeek = new Date(now.getTime() + 604800000);
  
  return {
    items: [
      {
        id: 'task1',
        title: 'Review project proposal',
        status: 'needsAction',
        due: tomorrow.toISOString().split('T')[0],
        position: '00000000000000000000',
        children: []
      },
      {
        id: 'task2',
        title: 'Complete quarterly report',
        status: 'needsAction',
        due: nextWeek.toISOString().split('T')[0],
        position: '00000000000000000001',
      },
      {
        id: 'task2a',
        title: 'Gather Q1 metrics',
        status: 'needsAction',
        position: '00000000000000000000',
        parent: 'task2',
      },
      {
        id: 'task2b',
        title: 'Write summary',
        status: 'completed',
        position: '00000000000000000001',
        parent: 'task2',
      },
      {
        id: 'task3',
        title: 'Schedule team meeting',
        status: 'completed',
        position: '00000000000000000002',
      },
      {
        id: 'task4',
        title: 'Update documentation',
        status: 'needsAction',
        position: '00000000000000000003',
      }
    ]
  };
}

function generateFakeCalendarEvents() {
  const now = new Date();
  const events = [];
  for (let i = 0; i < 5; i++) {
    const start = new Date(now.getTime() + (i * i * 24 * 60 * 60 * 1000));
    const end = new Date(start.getTime() + 3600000); // 1 hour duration
    events.push({
      id: `event_${i}`,
      summary: `Meeting with Team ${i + 1}`,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() }
    });
  }
  return events;
}

function generateFakeBinData() {
  const now = new Date();
  const general = new Date(now.getTime() + 86400000); // 1 days from now
  const recycling = new Date(now.getTime() + 259200000); // 3 days from now
  const fogo = new Date(now.getTime());
  
  return {
    FOGO: fogo.toISOString(),
    General: general.toISOString(),
    Recycling: recycling.toISOString()
  };
}