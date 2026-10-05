import java.io.File
import java.util.Properties
import javax.inject.Inject

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

// The browser add-on is the source of truth for prompts, styles and article extraction.
val addonDir: File = rootProject.file("../add-on")
val toolsDir: File = rootProject.file("../tools")

/** Runs tools/export-recipe.js: add-on/prompts.js -> song_recipe.json (+ goldens for unit tests). */
abstract class ExportRecipeTask : DefaultTask() {
    @get:InputFile @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val promptsFile: RegularFileProperty

    @get:InputFile @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val exportScript: RegularFileProperty

    @get:OutputDirectory
    abstract val assetsDir: DirectoryProperty

    @get:OutputFile
    abstract val goldensFile: RegularFileProperty

    @get:Inject
    abstract val execOps: ExecOperations

    @TaskAction
    fun export() {
        val recipe = assetsDir.file("recipe/song_recipe.json").get().asFile
        execOps.exec {
            commandLine(
                findNode(), exportScript.get().asFile.absolutePath,
                "--recipe", recipe.absolutePath,
                "--goldens", goldensFile.get().asFile.absolutePath,
            )
        }
    }

    // Android Studio and IDE-launched Gradle daemons often lack nvm's PATH entry.
    private fun findNode(): String {
        System.getenv("NODE")?.takeIf { it.isNotBlank() }?.let { return it }
        System.getenv("PATH").orEmpty().split(File.pathSeparator)
            .map { File(it, "node") }.firstOrNull { it.canExecute() }?.let { return it.absolutePath }
        File(System.getProperty("user.home"), ".nvm/versions/node").listFiles().orEmpty()
            .mapNotNull { File(it, "bin/node").takeIf(File::canExecute) }
            .maxByOrNull { node -> node.parentFile.parentFile.name.removePrefix("v").split('.').map { it.toIntOrNull() ?: 0 }.fold(0L) { acc, n -> acc * 1000 + n } }
            ?.let { return it.absolutePath }
        throw GradleException("Node.js is required to export the song recipe from add-on/prompts.js. Install node or set NODE=/path/to/node.")
    }
}

/** Copies the add-on's extraction scripts (Readability, article_extract, pdf.js) into assets/addon/. */
abstract class CopyAddonScriptsTask : DefaultTask() {
    @get:InputFiles @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val scripts: ConfigurableFileCollection

    @get:Internal
    abstract val addonRoot: DirectoryProperty

    @get:OutputDirectory
    abstract val assetsDir: DirectoryProperty

    @get:Inject
    abstract val fs: FileSystemOperations

    @TaskAction
    fun copy() {
        val root = addonRoot.get().asFile
        fs.sync {
            from(root) { include(scripts.files.map { it.relativeTo(root).invariantSeparatorsPath }) }
            into(assetsDir.dir("addon"))
        }
    }
}

val exportRecipe = tasks.register<ExportRecipeTask>("exportSongRecipe") {
    promptsFile.set(File(addonDir, "prompts.js"))
    exportScript.set(File(toolsDir, "export-recipe.js"))
    goldensFile.set(layout.buildDirectory.file("recipe-goldens/goldens.json"))
}

val copyAddonScripts = tasks.register<CopyAddonScriptsTask>("copyAddonScripts") {
    addonRoot.set(addonDir)
    scripts.from(
        File(addonDir, "Readability.js"),
        File(addonDir, "article_extract.js"),
        File(addonDir, "pdf.js"),
        File(addonDir, "vendor/pdfjs/pdf.min.js"),
        File(addonDir, "vendor/pdfjs/pdf.worker.min.js"),
    )
}

// Release signing: android/keystore.properties if present (see `just keystore`), else the debug key.
val keystoreProps = Properties().apply {
    rootProject.file("keystore.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}

android {
    namespace = "com.articlesong.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.articlesong.app"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // The screenshot tour isn't a test; `just screenshots` runs it on its own.
        testInstrumentationRunnerArguments["notClass"] = "com.articlesong.app.ScreenshotTour"
    }

    signingConfigs {
        if (keystoreProps.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += setOf(
                "META-INF/{AL2.0,LGPL2.1}",
                "META-INF/LICENSE*",
                "META-INF/NOTICE*",
                "META-INF/DEPENDENCIES",
                "META-INF/versions/9/OSGI-INF/MANIFEST.MF",
            )
        }
    }

    // FakeApis (a local stand-in for Suno, Anthropic and article pages) serves both test suites.
    sourceSets {
        getByName("test").kotlin.srcDir("src/sharedTest/java")
        getByName("androidTest").kotlin.srcDir("src/sharedTest/java")
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
        unitTests.all { test ->
            test.dependsOn(exportRecipe)
            // `just test-live` (-Plive=true) opts into tests that call the real Anthropic API.
            test.systemProperty("articlesong.live", providers.gradleProperty("live").getOrElse("false"))
            test.systemProperty("articlesong.goldens", exportRecipe.get().goldensFile.get().asFile.absolutePath)
            test.systemProperty(
                "articlesong.recipe",
                exportRecipe.get().assetsDir.get().file("recipe/song_recipe.json").asFile.absolutePath,
            )
        }
    }
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(exportRecipe, ExportRecipeTask::assetsDir)
        variant.sources.assets?.addGeneratedSourceDirectory(copyAddonScripts, CopyAddonScriptsTask::assetsDir)
    }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.process)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)

    implementation(libs.media3.exoplayer)
    implementation(libs.media3.session)
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)
    implementation(libs.work.runtime)
    implementation(libs.webkit)
    implementation(libs.datastore.preferences)
    implementation(libs.palette)
    implementation(libs.coil.compose)
    implementation(libs.coil.network)
    implementation(libs.okhttp)
    implementation(libs.serialization.json)
    implementation(libs.coroutines.android)
    implementation(libs.coroutines.guava)
    implementation(libs.anthropic)

    testImplementation(libs.junit)
    testImplementation(libs.truth)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)

    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.rules)
    androidTestImplementation(libs.androidx.test.core)
    androidTestImplementation(libs.compose.ui.test.junit4)
    androidTestImplementation(libs.okhttp.mockwebserver)
    androidTestImplementation(libs.truth)
    androidTestImplementation(libs.coroutines.test)
    androidTestImplementation(libs.uiautomator)
    androidTestImplementation(libs.espresso.core) // compose-test idling needs an API 36-aware Espresso
    androidTestImplementation(libs.work.testing)
}
