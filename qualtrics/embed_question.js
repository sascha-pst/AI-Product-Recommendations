/*
 * Paste into the JavaScript of a Text/Graphic question in the block that shows
 * the recommendations (question gear icon > Add JavaScript).
 *
 * Requires embedded data fields set earlier in Survey Flow:
 *   arm, scenario  (set by the Randomizer, see SURVEY_FLOW.md)
 *   chosen_product, chosen_rank, chosen_from_recs, time_to_choice_ms  (blank, filled here)
 */
Qualtrics.SurveyEngine.addOnload(function () {
  var BASE = "https://rec-engine.YOUR-SUBDOMAIN.workers.dev"; // <- your deployed Worker URL
  var q = this;
  q.hideNextButton();

  var src = BASE + "/?rid=" + encodeURIComponent("${e://Field/ResponseID}") +
            "&arm=" + encodeURIComponent("${e://Field/arm}") +
            "&scenario=" + encodeURIComponent("${e://Field/scenario}");

  var frame = document.createElement("iframe");
  frame.src = src;
  frame.title = "Product recommendations";
  frame.style.cssText = "width:100%;height:1400px;border:0;border-radius:12px;background:#f6f4ef";
  q.getQuestionContainer().appendChild(frame);

  window.addEventListener("message", function (event) {
    if (event.origin !== BASE) return;              // only trust our own site
    var d = event.data || {};
    if (d.source !== "rec-engine" || d.type !== "choice") return;
    Qualtrics.SurveyEngine.setEmbeddedData("chosen_product", d.product_id);
    Qualtrics.SurveyEngine.setEmbeddedData("chosen_rank", d.rank);
    Qualtrics.SurveyEngine.setEmbeddedData("chosen_from_recs", d.from_recs ? 1 : 0);
    Qualtrics.SurveyEngine.setEmbeddedData("time_to_choice_ms", d.time_to_choice_ms);
    q.showNextButton();
  });
});
