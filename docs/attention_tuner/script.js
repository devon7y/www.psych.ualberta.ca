document.addEventListener('DOMContentLoaded', () => {
    const words = [
        "ABSENCE",
        "ACCORD",
        "ACCOUNT",
        "ACID",
        "ACRE",
        "AFFAIR",
        "AGENT",
        "AMOUNT",
        "ANCHOR",
        "ANGEL",
        "ANGLE",
        "APPLE",
        "ARMOR",
        "ARRAY",
        "ARROW",
        "ARTIST",
        "ASPECT",
        "ATTACK",
        "AUTHOR",
        "AUTUMN",
        "BABY",
        "BANNER",
        "BARGAIN",
        "BARREL",
        "BASIN",
        "BASIS",
        "BASKET",
        "BATTLE",
        "BEAUTY",
        "BEAVER",
        "BEDROOM",
        "BEGGAR",
        "BEING",
        "BELIEF",
        "BERRY",
        "BLANKET",
        "BLESSING",
        "BODY",
        "BOTTOM",
        "BOUNDARY",
        "BUBBLE",
        "BUILDING",
        "BULLET",
        "BUREAU",
        "BUSHEL",
        "BUSINESS",
        "BUTCHER",
        "BUTTER",
        "BUTTON",
        "CABIN",
        "CABLE",
        "CAMPAIGN",
        "CANAL",
        "CANDLE",
        "CANDY",
        "CANNON",
        "CANOE",
        "CANVAS",
        "CAPTAIN",
        "CAPTIVE",
        "CARBON",
        "CAREER",
        "CARPET",
        "CARRIAGE",
        "CASTLE",
        "CATTLE",
        "CELLAR",
        "CENTER",
        "CHAIRMAN",
        "CHAMBER",
        "CHANNEL",
        "CHAPEL",
        "CHAPTER",
        "CHERRY",
        "CHIMNEY",
        "CIRCLE",
        "CIRCUIT",
        "CITY",
        "CLIMATE",
        "CLOSET",
        "CLOTHING",
        "CLUSTER",
        "COFFEE",
        "COLLAR",
        "COLLEGE",
        "COLONEL",
        "COLOUR",
        "COLUMN",
        "COMMERCE",
        "COMPASS",
        "COMPOUND",
        "COMRADE",
        "CONCERT",
        "CONGRESS",
        "CONQUEST",
        "CONTENTS",
        "CONTEST",
        "CONTRACT",
        "COPY",
        "CORNER",
        "COSTUME",
        "COTTAGE",
        "COTTON",
        "COUNTRY",
        "COUNTY",
        "COUPLE",
        "COURAGE",
        "COUSIN",
        "CREATURE",
        "CREDIT",
        "CRYSTAL",
        "CULTURE",
        "CURRENT",
        "CUSTOM",
        "DANGER",
        "DARKNESS",
        "DAUGHTER",
        "DAYLIGHT",
        "DEALER",
        "DEGREE",
        "DESPAIR",
        "DETAIL",
        "DEVICE",
        "DEVIL",
        "DIAMOND",
        "DIET",
        "DINNER",
        "DISEASE",
        "DISTANCE",
        "DISTRICT",
        "DOLLAR",
        "DOORWAY",
        "DOUBLE",
        "DRAGON",
        "DUTY",
        "EAGLE",
        "ECHO",
        "EFFECT",
        "EFFORT",
        "ELBOW",
        "ELDER",
        "EMPIRE",
        "ENGINE",
        "ERRAND",
        "ESTATE",
        "EVENING",
        "EVENT",
        "EXCESS",
        "EXTENT",
        "FABRIC",
        "FACTOR",
        "FAILURE",
        "FARMER",
        "FATHER",
        "FEATHER",
        "FEATURE",
        "FEELING",
        "FEVER",
        "FIGURE",
        "FINGER",
        "FLAVOR",
        "FOLLY",
        "FOOTBALL",
        "FOREHEAD",
        "FOREST",
        "FORTUNE",
        "FOUNTAIN",
        "FRONTIER",
        "FUNERAL",
        "FURY",
        "FUTURE",
        "GARDEN",
        "GARMENT",
        "GENIUS",
        "GESTURE",
        "GODDESS",
        "GOODBYE",
        "HABIT",
        "HAMMER",
        "HARBOUR",
        "HARNESS",
        "HARVEST",
        "HATRED",
        "HEAVEN",
        "HELMET",
        "HERALD",
        "HERO",
        "HIGHWAY",
        "HORROR",
        "HOTEL",
        "HUNTER",
        "HUSBAND",
        "ILLNESS",
        "IMAGE",
        "INCOME",
        "INSECT",
        "INSTANT",
        "INTEREST",
        "IRON",
        "ISLAND",
        "JACKET",
        "JERSEY",
        "JEWEL",
        "JOURNAL",
        "JOURNEY",
        "JUDGMENT",
        "JUSTICE",
        "KEEPER",
        "KINDNESS",
        "KINGDOM",
        "KITCHEN",
        "KITTEN",
        "LADY",
        "LANGUAGE",
        "LAUGHTER",
        "LAWYER",
        "LAYER",
        "LEADER",
        "LEARNING",
        "LEATHER",
        "LECTURE",
        "LEGEND",
        "LEMON",
        "LETTER",
        "LEVEL",
        "LILY",
        "LIMIT",
        "LINEN",
        "LION",
        "LIQUID",
        "LIQUOR",
        "LOVER",
        "LUMBER",
        "LUNCHEON",
        "MACHINE",
        "MADAM",
        "MAIDEN",
        "MAJOR",
        "MAKER",
        "MANNER",
        "MARBLE",
        "MARKET",
        "MARRIAGE",
        "MASTER",
        "MATTER",
        "MAYOR",
        "MEADOW",
        "MEANING",
        "MEANTIME",
        "MEETING",
        "MEMBER",
        "MERCHANT",
        "MERCY",
        "MERIT",
        "MESSAGE",
        "METAL",
        "METHOD",
        "MILLION",
        "MINUTE",
        "MIRROR",
        "MISCHIEF",
        "MISSION",
        "MISTAKE",
        "MISTRESS",
        "MIXTURE",
        "MODEL",
        "MOISTURE",
        "MOMENT",
        "MONARCH",
        "MONEY",
        "MONKEY",
        "MONSTER",
        "MOTHER",
        "MOTION",
        "MOTIVE",
        "MOTOR",
        "MOUNTAIN",
        "MOVIE",
        "MUSCLE",
        "MUSIC",
        "NATION",
        "NAVY",
        "NEEDLE",
        "NEPHEW",
        "NOTHING",
        "NOTION",
        "NOVEL",
        "NUMBER",
        "OBJECT",
        "OCEAN",
        "ODOR",
        "OFFENCE",
        "OLIVE",
        "ONION",
        "OPERA",
        "ORANGE",
        "ORCHARD",
        "ORGAN",
        "OUTLINE",
        "OVEN",
        "OWNER",
        "OYSTER",
        "PACKAGE",
        "PAINTER",
        "PAINTING",
        "PALACE",
        "PAPER",
        "PARCEL",
        "PARENT",
        "PARLOR",
        "PARTNER",
        "PARTY",
        "PASSION",
        "PASTURE",
        "PATENT",
        "PATIENCE",
        "PATIENT",
        "PATTERN",
        "PAYMENT",
        "PENNY",
        "PEPPER",
        "PERFUME",
        "PERSON",
        "PICTURE",
        "PIGEON",
        "PILLOW",
        "PILOT",
        "PISTOL",
        "PITCHER",
        "PLANET",
        "PLATFORM",
        "PLAYER",
        "PLEASURE",
        "POCKET",
        "POEM",
        "POLICE",
        "PONY",
        "POWDER",
        "PRAIRIE",
        "PRAYER",
        "PRESSURE",
        "PRINCESS",
        "PRISON",
        "PROBLEM",
        "PRODUCT",
        "PROGRAM",
        "PROJECT",
        "PROSPECT",
        "PROVINCE",
        "PUPIL",
        "PURSUIT",
        "PUZZLE",
        "QUARTER",
        "QUESTION",
        "RABBIT",
        "RAILWAY",
        "RATTLE",
        "READING",
        "REASON",
        "RECEIPT",
        "RECORD",
        "REFUGE",
        "RELIEF",
        "RESEARCH",
        "RESORT",
        "RESOURCE",
        "RIBBON",
        "RICHES",
        "RIDER",
        "RIFLE",
        "RIVAL",
        "RIVER",
        "ROBBER",
        "ROBIN",
        "RUBBER",
        "SADDLE",
        "SAILOR",
        "SALAD",
        "SANDWICH",
        "SCATTER",
        "SCHOLAR",
        "SCIENCE",
        "SEASON",
        "SECTION",
        "SENATE",
        "SENTENCE",
        "SERIES",
        "SERVANT",
        "SERVICE",
        "SHELTER",
        "SHEPHERD",
        "SHERIFF",
        "SHIPPING",
        "SHOWER",
        "SICKNESS",
        "SILENCE",
        "SILVER",
        "SINGER",
        "SINGLE",
        "SISTER",
        "SLIPPER",
        "SOLDIER",
        "SORROW",
        "SPARROW",
        "SPEAKER",
        "SPIDER",
        "SPIRIT",
        "SQUIRREL",
        "STANDARD",
        "STANZA",
        "STATION",
        "STATUS",
        "STEAMER",
        "STOCKING",
        "STOMACH",
        "STORY",
        "STUDENT",
        "SUBJECT",
        "SUCCESS",
        "SUGAR",
        "SULPHUR",
        "SUMMER",
        "SUNSET",
        "SUPPER",
        "SURFACE",
        "SURVEY",
        "SYSTEM",
        "TABLE",
        "TALENT",
        "TEACHER",
        "TEMPER",
        "TEMPLE",
        "THEATER",
        "THEORY",
        "THUNDER",
        "TICKET",
        "TIGER",
        "TIMBER",
        "TOTAL",
        "TRAFFIC",
        "TRAINING",
        "TRAITOR",
        "TREASURE",
        "TRIBUTE",
        "TRIUMPH",
        "TROUBLE",
        "TUNE",
        "TURKEY",
        "TWILIGHT",
        "UNCLE",
        "UNION",
        "UNIT",
        "VALLEY",
        "VALUE",
        "VAPOR",
        "VELVET",
        "VESSEL",
        "VICTIM",
        "VILLAGE",
        "VIRTUE",
        "VOYAGE",
        "WAGON",
        "WATER",
        "WEAKNESS",
        "WEAPON",
        "WEDDING",
        "WIDOW",
        "WILLOW",
        "WINDOW",
        "WINTER",
        "WISDOM",
        "WITNESS",
        "WOMEN",
        "WORKER",
        "WORSHIP",
        "WRINKLE",
        "WRITER",
        "WRITING"
    ];

    const startScreen = document.getElementById('start-screen');
    
    const studyPhase = document.getElementById('study-phase');
    const submitAnswer = document.getElementById('submit-answer');
    const distractorPhase = document.getElementById('distractor-phase');
    const recognitionPhase = document.getElementById('recognition-phase');
    const resultsPhase = document.getElementById('results-phase');
    const wordDisplay = document.getElementById('word-display');
    const distractorProblem = document.getElementById('distractor-problem');
    const distractorAnswer = document.getElementById('distractor-answer');
    const timerDisplay = document.getElementById('timer');
    const recognitionWord = document.getElementById('recognition-word');
    const yesButton = document.getElementById('yes-button');
    const noButton = document.getElementById('no-button');
    const resultsSummary = document.getElementById('results-summary');
    const resultsChart = document.getElementById('results-chart');
    const resultsExplanation = document.getElementById('results-explanation');
    const playAgainBtn = document.getElementById('play-again-btn');
    const clearResultsBtn = document.getElementById('clear-results-btn');

    

    // Game state
    let currentPhase = 'start';
    let experimentOrder = ['pure-strong', 'pure-weak', 'mixed'];
    let currentExperimentIndex = 0;
    let listType = ''; // 'pure-strong', 'pure-weak', or 'mixed'
    let studyList = [];
    let recognitionList = [];
    let lureList = [];
    let userResponses = JSON.parse(localStorage.getItem('invertedListStrengthEffectResults')) || [];
    let preSampledWords = [];

    // --- Game Logic ---

    function startExperiment() {
        console.log('startExperiment function called.');
        // Sample 60 unique words at the start of the experiment
        let wordCopy = [...words];
        preSampledWords = [];
        for (let i = 0; i < 60; i++) {
            const randomIndex = Math.floor(Math.random() * wordCopy.length);
            preSampledWords.push(wordCopy.splice(randomIndex, 1)[0]);
        }

        // Shuffle the experiment order
        for (let i = experimentOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [experimentOrder[i], experimentOrder[j]] = [experimentOrder[j], experimentOrder[i]];
        }
        currentExperimentIndex = 0;
        startScreen.style.display = 'none';
        studyPhase.style.display = 'block';
        currentPhase = 'study';
        runNextListType();
    }

    function runNextListType() {
        if (currentExperimentIndex < experimentOrder.length) {
            // Hide all other phases and show study phase
            startScreen.style.display = 'none';
            distractorPhase.style.display = 'none';
            recognitionPhase.style.display = 'none';
            resultsPhase.style.display = 'none';
            studyPhase.style.display = 'block'; // Ensure study phase is visible
            currentPhase = 'study';

            listType = experimentOrder[currentExperimentIndex];

            // Get the 20 words for the current condition from preSampledWords
            const startIndex = currentExperimentIndex * 20;
            const wordsForCurrentCondition = preSampledWords.slice(startIndex, startIndex + 20);

            generateStudyList(wordsForCurrentCondition); // Pass the words to generateStudyList
            startStudyPhase();
        } else {
            // All list types completed, show final results
            studyPhase.style.display = 'none';
            distractorPhase.style.display = 'none';
            recognitionPhase.style.display = 'none';
            resultsPhase.style.display = 'block'; // Show results phase
            currentPhase = 'results';
            showResults(); // Call showResults only once at the very end
        }
    }

    function generateStudyList(selectedWordsForExperiment) {
        // selectedWordsForExperiment is already the 20 unique words for this condition
        // No need to sample from 'words' array here anymore

        // Split into study words and lure words
        const studyWordsRaw = selectedWordsForExperiment.slice(0, 10);
        const lureWordsRaw = selectedWordsForExperiment.slice(10, 20);

        studyList = [];
        lureList = []; // Reset lureList for each new experiment condition

        let strongCount = 0;
        let weakCount = 0;

        if (listType === 'pure-strong') {
            strongCount = 10;
        } else if (listType === 'pure-weak') {
            weakCount = 10;
        } else { // mixed
            strongCount = 5;
            weakCount = 5;
        }

        // Assign strengths to study words
        let tempStudyWords = [...studyWordsRaw]; // Create a mutable copy
        for (let i = 0; i < strongCount; i++) {
            const randomIndex = Math.floor(Math.random() * tempStudyWords.length);
            studyList.push({ word: tempStudyWords.splice(randomIndex, 1)[0], strength: 'strong' });
        }

        for (let i = 0; i < weakCount; i++) {
            const randomIndex = Math.floor(Math.random() * tempStudyWords.length);
            studyList.push({ word: tempStudyWords.splice(randomIndex, 1)[0], strength: 'weak' });
        }

        // Populate lureList
        for (const word of lureWordsRaw) {
            lureList.push({ word: word, strength: 'lure' });
        }

        // Shuffle the study list
        studyList = studyList.sort(() => Math.random() - 0.5);
    }

    function startStudyPhase() {
        let wordIndex = 0;

        function showNextWord() {
            if (wordIndex < studyList.length) {
                const item = studyList[wordIndex];
                wordDisplay.textContent = item.word;
                wordDisplay.className = item.strength === 'strong' ? 'strong-word' : 'weak-word';
                const duration = item.strength === 'strong' ? 2000 : 500;
                wordIndex++;
                setTimeout(showNextWord, duration + 500); // word duration + 500ms pause
            } else {
                // End of study phase
                studyPhase.style.display = 'none';
                distractorPhase.style.display = 'block';
                currentPhase = 'distractor';
                startDistractorPhase();
            }
        }

        showNextWord();
    }

    function startDistractorPhase() {
        let distractorTimer; // To store the interval ID
        let currentProblemCorrectAnswer; // To store the correct answer for the current problem

        function generateAndDisplayNewProblem() {
            distractorAnswer.value = ''; // Clear the input field
            const num1 = Math.floor(Math.random() * 10) + 1;
            const num2 = Math.floor(Math.random() * 10) + 1;
            const num3 = Math.floor(Math.random() * 10) + 1;
            const problem = `${num1} + ${num2} + ${num3} = ?`;
            currentProblemCorrectAnswer = num1 + num2 + num3; // Store the correct answer

            distractorProblem.textContent = problem;
        }

        function handleSubmission() {
            // Prevent submission if the input field is empty
            if (distractorAnswer.value.trim() === '') {
                return; // Do nothing if the input is empty
            }
            // For now, we just generate a new problem and clear the input
            // The user's answer is not being checked or scored in this version
            generateAndDisplayNewProblem();
        }

        // Display the first problem when the phase starts
        generateAndDisplayNewProblem();

        let timeLeft = 10; // 10 seconds for the distractor task
        timerDisplay.textContent = timeLeft;

        distractorTimer = setInterval(() => {
            timeLeft--;
            timerDisplay.textContent = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(distractorTimer); // Stop the timer
                distractorPhase.style.display = 'none'; // Hide distractor phase
                recognitionPhase.style.display = 'block'; // Show recognition phase
                currentPhase = 'recognition';
                startRecognitionPhase(); // Start the recognition phase
            }
        }, 1000); // Update every second

        // Event listener for the submit button
        submitAnswer.onclick = handleSubmission;

        // Event listener for the input field (Enter key)
        distractorAnswer.onkeydown = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault(); // Prevent default form submission behavior
                handleSubmission();
            }
        };
    }

    function startRecognitionPhase() {
        generateRecognitionList();
        let wordIndex = 0;

        

        function showNextRecognitionWord() {
            if (wordIndex < recognitionList.length) {
                recognitionWord.textContent = recognitionList[wordIndex].word;
            } else {
                // End of recognition phase for current list type
                recognitionPhase.style.display = 'none';
                currentExperimentIndex++; // Move to the next experiment condition
                runNextListType(); // Start the next condition or show final results
            }
        }

        yesButton.onclick = () => {
            recordResponse(true, wordIndex);
            wordIndex++;
            showNextRecognitionWord();
        };

        noButton.onclick = () => {
            recordResponse(false, wordIndex);
            wordIndex++;
            showNextRecognitionWord();
        };

        showNextRecognitionWord();
    }

    function generateRecognitionList() {
        recognitionList = [...studyList, ...lureList];
        // Shuffle the combined list
        recognitionList = recognitionList.sort(() => Math.random() - 0.5);
    }

    function recordResponse(response, index) {
        const item = recognitionList[index];
        userResponses.push({
            word: item.word,
            strength: item.strength,
            response: response,
            correct: (item.strength !== 'lure' && response === true) || (item.strength === 'lure' && response === false),
            listType: listType // Add the listType to the stored response
        });
    }

    function showResults() {
        // Filter responses by listType
        const pureStrongResponses = userResponses.filter(r => r.listType === 'pure-strong');
        const pureWeakResponses = userResponses.filter(r => r.listType === 'pure-weak');
        const mixedResponses = userResponses.filter(r => r.listType === 'mixed');

        // Calculate accuracy for each list type
        const strong_pure_accuracy = pureStrongResponses.length > 0 ? (pureStrongResponses.filter(r => r.correct).length / pureStrongResponses.length) * 100 : 0;
        const weak_pure_accuracy = pureWeakResponses.length > 0 ? (pureWeakResponses.filter(r => r.correct).length / pureWeakResponses.length) * 100 : 0;
        const strong_mixed_accuracy = mixedResponses.length > 0 ? (mixedResponses.filter(r => r.correct).length / mixedResponses.length) * 100 : 0;
        const weak_mixed_accuracy = mixedResponses.length > 0 ? (mixedResponses.filter(r => r.correct).length / mixedResponses.length) * 100 : 0;

        // Overall accuracy (already correct)
        const overall_correct = userResponses.filter(r => r.correct).length;
        const overall_total_items = userResponses.length;
        const overall_accuracy = overall_total_items > 0 ? (overall_correct / overall_total_items) * 100 : 0;

        resultsSummary.innerHTML = ``;

        // Draw chart
        google.charts.load('current', {packages:['corechart']});
        google.charts.setOnLoadCallback(drawChart);

        function drawChart() {
            const data = google.visualization.arrayToDataTable([
                ['Condition', 'Strong Pure', 'Weak Pure', 'Mixed Strong', 'Mixed Weak'],
                ['Accuracy', strong_pure_accuracy, weak_pure_accuracy, strong_mixed_accuracy, weak_mixed_accuracy]
            ]);

            const options = {
                backgroundColor: '#1A1F2E',
                vAxis: { title: 'Accuracy (%)', viewWindow: { min: 0, max: 100 }, textStyle: { color: '#e1e8ed' }, titleTextStyle: { color: '#e1e8ed' } },
                hAxis: { title: '', textStyle: { color: '#e1e8ed' }, titleTextStyle: { color: '#e1e8ed' } },
                legend: { position: 'bottom', textStyle: { color: '#e1e8ed', fontSize: 10 } },
                seriesType: 'bars',
                colors: ['#5b8fd9', '#00d68f', '#F14709', '#F14709'],
                bar: { groupWidth: '75%' }, // Adjust group width
                series: {
                    0: { type: 'bars' }, // Strong Pure
                    1: { type: 'bars' }, // Weak Pure
                    2: { type: 'bars' }, // Mixed Strong
                    3: { type: 'bars' }  // Mixed Weak
                },
                height: 400,
                width: '100%',
                chartArea: { left: 0, top: 0, width: '100%', height: '100%' }
            };

            const chart = new google.visualization.ComboChart(resultsChart);
            chart.draw(data, options);
        }

        resultsExplanation.textContent = 'Notice anything strange? You were likely more accurate at recognizing \'strong\' words when they were in a list with other strong words (pure list) than when they were mixed with weak words. This is the inverted list-strength effect! It happens because when your brain expects only deep, meaningful information, it narrows its focus. When it expects a mix of shallow and deep information, it widens its focus, making it harder to pinpoint the specific deep features of the strong words.';

        // Save results to local storage
        localStorage.setItem('invertedListStrengthEffectResults', JSON.stringify(userResponses));
        playAgainBtn.style.display = 'block'; // Make sure playAgainBtn is visible
    }

    // --- Event Listeners for new buttons ---
    playAgainBtn.addEventListener('click', () => {
        // Reset game state for a full restart
        studyPhase.style.display = 'none';
        distractorPhase.style.display = 'none';
        recognitionPhase.style.display = 'none';
        resultsPhase.style.display = 'none';
        startScreen.style.display = 'block';
        currentPhase = 'start';
        studyList = [];
        recognitionList = [];
        userResponses = []; // Clear user responses for a fresh start
        localStorage.removeItem('invertedListStrengthEffectResults'); // Clear stored results
        distractorAnswer.value = ''; // Clear previous answer
        playAgainBtn.style.display = 'none'; // Hide play again button until all conditions are done
        startExperiment(); // Restart the entire experiment sequence
    });

    

    // --- Init ---
    // The game now starts on button click

    // --- Init ---
    // The game now starts on button click
    const startExperimentBtn = document.getElementById('start-experiment-btn');
    startExperimentBtn.addEventListener('click', startExperiment);
    playAgainBtn.style.display = 'none'; // Initially hide the play again button
});
