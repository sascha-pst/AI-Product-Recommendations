/* Study v2. Installed in QID19 by the repair script. Next requires a server-saved choice. */
(function () {
  var cleanup = function () {};
  Qualtrics.SurveyEngine.addOnReady(function () {
    var q = this;
    var BASE = 'https://rec-engine.sashaschaps.workers.dev';
    var PILOT = true; // Staging only. Set false for the verified main study.
    var rid = '${e://Field/ResponseID}';
    var arm = '${e://Field/arm}';
    var scenario = '${e://Field/scenario}';
    var finished = false;
    q.hideNextButton();
    var status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = 'Load the shopping task below and confirm your choice to continue.';
    q.getQuestionContainer().appendChild(status);
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(rid) || !/^[12]$/.test(arm) || scenario !== 'commute') {
      status.textContent = 'The survey assignment is missing. Please contact the researcher.';
      return;
    }
    var frame = document.createElement('iframe');
    var src = new URL(BASE + '/');
    src.searchParams.set('rid', rid);
    src.searchParams.set('arm', arm);
    src.searchParams.set('scenario', scenario);
    src.searchParams.set('parent_origin', window.location.origin);
    if (PILOT) src.searchParams.set('preview', '1');
    frame.title = 'Product recommendation shopping task';
    frame.style.cssText = 'width:100%;height:1200px;border:0;border-radius:12px;background:#f6f4ef';
    var listener = function (event) {
      if (finished || event.origin !== BASE || event.source !== frame.contentWindow) return;
      var d = event.data || {};
      if (d.source !== 'rec-engine' || d.type !== 'choice' || d.study_id !== 'ai-disclosure-v1' || d.rid !== rid || d.arm !== arm || d.scenario !== scenario) return;
      if (typeof d.product_id !== 'string' || !d.product_id || !Number.isInteger(d.rank) || d.rank < 0 || d.rank > 3 || d.from_recs !== (d.rank > 0) || !Number.isFinite(d.time_to_choice_ms) || d.time_to_choice_ms < 0 || typeof d.stimuli_version !== 'string') return;
      Qualtrics.SurveyEngine.setEmbeddedData('chosen_product', d.product_id);
      Qualtrics.SurveyEngine.setEmbeddedData('chosen_rank', d.rank);
      Qualtrics.SurveyEngine.setEmbeddedData('chosen_from_recs', d.from_recs ? 1 : 0);
      Qualtrics.SurveyEngine.setEmbeddedData('time_to_choice_ms', d.time_to_choice_ms);
      Qualtrics.SurveyEngine.setEmbeddedData('stimuli_version', d.stimuli_version);
      Qualtrics.SurveyEngine.setEmbeddedData('task_completed', '1');
      finished = true;
      status.textContent = 'Your choice has been saved. Select Next to continue.';
      q.showNextButton();
    };
    window.addEventListener('message', listener);
    frame.src = src.toString();
    q.getQuestionContainer().appendChild(frame);
    cleanup = function () { window.removeEventListener('message', listener); frame.remove(); };
  });
  Qualtrics.SurveyEngine.addOnUnload(function () { cleanup(); });
})();
