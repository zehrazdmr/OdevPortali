const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'https://9b1a-193-140-142-102.ngrok-free.app/api';

const buildUrl = (endpoint, query = {}) => {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = new URL(`${API_BASE_URL}${normalizedEndpoint}`);

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
};

const parseResponse = async (response) => {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
};

export const request = async (endpoint, options = {}) => {
  const { query, headers = {}, body, ...rest } = options;
  const finalHeaders = {
    'ngrok-skip-browser-warning': 'true',
    ...headers
  };

  let requestBody = body;

  if (body !== undefined && !(body instanceof FormData)) {
    if (!finalHeaders['Content-Type']) {
      finalHeaders['Content-Type'] = 'application/json';
    }

    requestBody = JSON.stringify(body);
  }

  const response = await fetch(buildUrl(endpoint, query), {
    ...rest,
    headers: finalHeaders,
    body: requestBody
  });

  const data = await parseResponse(response);

  return {
    ok: response.ok,
    status: response.status,
    data,
    error: response.ok ? null : data?.error || data?.message || 'Istek basarisiz.',
    response
  };
};

export const api = {
  auth: {
    login: (body) => request('/auth/login', { method: 'POST', body }),
    register: (body) => request('/auth/register', { method: 'POST', body })
  },
  courses: {
    list: () => request('/courses'),
    create: (body, headers) => request('/courses', { method: 'POST', body, headers }),
    remove: (dersKodu, headers) => request(`/courses/${dersKodu}`, { method: 'DELETE', headers })
  },
  criteria: {
    listByCourse: (dersKodu) => request(`/criteria/${dersKodu}`),
    create: (body, headers) => request('/criteria', { method: 'POST', body, headers })
  },
  submissions: {
    create: (body) => request('/submissions', { method: 'POST', body })
  },
  evaluations: {
    checkSubmissionStatus: (userId, dersKodu) =>
      request('/check-submission-status', { query: { userId, dersKodu } }),
    assignVideo: (userId, dersKodu) => request(`/assign-video/${userId}/${dersKodu}`)
  },
  grades: {
    create: (body, headers) => request('/grades', { method: 'POST', body, headers })
  },
  admin: {
    uploadStudents: (body, headers) => request('/admin/upload-students', { method: 'POST', body, headers }),
    listInstructors: (headers) => request('/admin/instructors', { headers }),
    createInstructor: (body, headers) => request('/admin/instructors', { method: 'POST', body, headers }),
    deleteInstructor: (id, headers) => request(`/admin/instructors/${id}`, { method: 'DELETE', headers }),
    listSubmissions: (dersKodu, headers) => request(`/admin/submissions/${dersKodu}`, { headers }),
    listAllStudentsStatus: (dersKodu, headers) => request(`/admin/all-students-status/${dersKodu}`, { headers }),
    getSubmissionDetail: (submissionId, headers) => request(`/admin/submission-detail/${submissionId}`, { headers }),
    gradeSubmission: (body, headers) => request('/admin/grade-submission', { method: 'POST', body, headers })
  },
  settings: {
    getVideoLimit: (dersKodu, headers) => request('/settings/video_limit', { query: { dersKodu }, headers }),
    updateVideoLimit: (body, headers) => request('/settings/update-limit', { method: 'POST', body, headers })
  }
};
